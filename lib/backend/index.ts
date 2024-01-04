import { Construct } from 'constructs';
import { AppConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { EnvironmentStage } from './environment';
import Pipeline from './pipeline';

export interface BackendProps extends AppConfig {
    cdkPipeline: CodePipeline;
}

export default class Backend extends Construct {
    constructor(scope: Construct, id: string, props: BackendProps) {
        super(scope, id);

        this.createEnvironmentStages(props);
        this.createPipeline(props);
    }

    private createEnvironmentStages(props: BackendProps) {
        const { appName, backend, awsEnvironment } = props;

        const waves = groupBy(backend.environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const wave = props.cdkPipeline.addWave(`Backend-Wave-${waveNumber}`);

            for (const environment of waves[waveNumber]) {
                wave.addStage(
                    new EnvironmentStage(
                        this,
                        `${appName}-${environment.name}-BackendEnvironmentStage`,
                        {
                            appName: appName,
                            environment: environment,
                            stackProps: {
                                stackName: `${appName}Backend-${environment.name}Environment`,
                                description: `Backend Stack for the ${appName}'s ${environment.name} environment`,
                                env: {
                                    account: awsEnvironment.account,
                                    region: awsEnvironment.region,
                                },
                            },
                        },
                    ),
                );
            }
        }
    }

    private createPipeline(props: BackendProps) {
        const { appName, backend } = props;

        new Pipeline(this, `${props.appName}-BackendPipeline`, { appName, backend });
    }
}
