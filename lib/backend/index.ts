import { Construct } from 'constructs';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { AppConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';
import { EnvironmentStage } from './environment';
import { CommonStage } from './common';

export interface BackendProps extends AppConfig {
    infraPipeline: CodePipeline;
}

export default class Backend extends Construct {
    constructor(scope: Construct, id: string, props: BackendProps) {
        super(scope, id);

        this.createEnvironmentStages(props);
        this.createCommonStage(props);
    }

    private createEnvironmentStages(props: BackendProps) {
        const { appName, backend, awsEnvironment, dns } = props;

        const waves = groupBy(backend.environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const wave = props.infraPipeline.addWave(`Backend-Wave-${waveNumber}`);

            for (const environment of waves[waveNumber]) {
                wave.addStage(
                    new EnvironmentStage(this, `${environment.name}-EnvironmentStage`, {
                        stageName: `Backend-${environment.name}-Stage`,
                        appName: appName,
                        environment: environment,
                        dns: dns,
                        stackProps: {
                            stackName: `${appName}-BE-${environment.name}`,
                            description: `Backend Stack for the ${appName}'s ${environment.name} environment`,
                            env: {
                                account: awsEnvironment.account,
                                region: awsEnvironment.region,
                            },
                        },
                    }),
                );
            }
        }
    }

    createCommonStage(props: BackendProps) {
        const { appName, awsEnvironment } = props;

        props.infraPipeline.addStage(
            new CommonStage(this, 'CommonStage', {
                stageName: 'Backend-Common-Stage',
                stackProps: {
                    stackName: `${appName}-BE-Common`,
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
