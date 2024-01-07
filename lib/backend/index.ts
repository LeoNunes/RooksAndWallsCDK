import { Construct } from 'constructs';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { AppConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';
import { EnvironmentStage } from './environment';
import { CommonStage } from './common';

export interface BackendProps extends AppConfig {
    cdkPipeline: CodePipeline;
}

export default class Backend extends Construct {
    constructor(scope: Construct, id: string, props: BackendProps) {
        super(scope, id);

        this.createEnvironmentStages(props);
        this.createCommonStage(props);
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
                            stageName: `${environment.name}-Stage`,
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

    createCommonStage(props: BackendProps) {
        const { appName, awsEnvironment } = props;

        props.cdkPipeline.addStage(
            new CommonStage(this, `${appName}-BackendCommonStage`, {
                stageName: 'Backend-Common-Stage',
                stackProps: {
                    stackName: `${appName}-BackendCommon`,
                    description: `Backend Stack for ${appName} with common constructs`,
                    env: {
                        account: awsEnvironment.account,
                        region: awsEnvironment.region,
                    },
                },
                ...props,
            }),
        );
    }
}
