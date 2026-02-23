import { Construct } from 'constructs';
import { CodePipeline } from 'aws-cdk-lib/pipelines';
import { AppConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';
import { WebEnvironmentStage } from './environment';
import { WebCommonStage } from './common';

export interface WebProps extends AppConfig {
    infraPipeline: CodePipeline;
}

export default class Web extends Construct {
    constructor(scope: Construct, id: string, props: WebProps) {
        super(scope, id);

        this.createEnvironmentStages(props);
        this.createCommonStage(props);
    }

    private createEnvironmentStages(props: WebProps) {
        const { appName, web, awsEnvironment, dns } = props;

        const waves = groupBy(web.environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const wave = props.infraPipeline.addWave(`Web-Wave-${waveNumber}`);

            for (const environment of waves[waveNumber]) {
                wave.addStage(
                    new WebEnvironmentStage(this, `${environment.name}-WebEnvironmentStage`, {
                        stageName: `Web-${environment.name}-Stage`,
                        appName: appName,
                        environment: environment,
                        dns: dns,
                        stackProps: {
                            stackName: `${appName}-WEB-${environment.name}`,
                            description: `Web Stack for the ${appName}'s ${environment.name} environment`,
                            env: {
                                account: awsEnvironment.account,
                                // CloudFront requires ACM certificates in us-east-1
                                region: 'us-east-1',
                            },
                        },
                    }),
                );
            }
        }
    }

    private createCommonStage(props: WebProps) {
        const { appName, awsEnvironment } = props;

        props.infraPipeline.addStage(
            new WebCommonStage(this, 'WebCommonStage', {
                stageName: 'Web-Common-Stage',
                stackProps: {
                    stackName: `${appName}-WEB-Common`,
                    description: `Web Stack for ${appName} with common constructs`,
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
