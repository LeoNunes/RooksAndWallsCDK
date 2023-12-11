import { Construct } from 'constructs';
import { AppConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { EnvironmentStage } from './environment';

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
        const waves = groupBy(props.backend.environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const wave = props.cdkPipeline.addWave(`Backend-Wave-${waveNumber}`);

            for (const environment of waves[waveNumber]) {
                wave.addStage(
                    new EnvironmentStage(
                        this,
                        `${props.appName}-${environment.name}-BackendEnvironmentStage`,
                        {
                            appName: props.appName,
                            environment: environment,
                            stackProps: {
                                stackName: `${props.appName}${environment.name}BackendEnvironment`,
                                description: `Backend Stack for the ${props.appName}'s ${environment.name} environment`,
                                env: {
                                    account: props.awsEnvironment.account,
                                    region: props.awsEnvironment.region,
                                },
                            },
                        },
                    ),
                );
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createPipeline(props: BackendProps) {
        // TODOO
    }
}
