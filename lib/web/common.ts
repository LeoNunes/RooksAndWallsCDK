import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { AppConfig } from '../config/config_def';
import WebPipeline from './web_pipeline';

export interface WebCommonStackProps extends AppConfig {
    stackProps: cdk.StackProps;
}

/** Constructs used by all web environments, like the Web Pipeline (deploying code to all environments). */
export class WebCommonStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: WebCommonStackProps) {
        super(scope, id, props.stackProps);

        this.createPipeline(props);
    }

    private createPipeline(props: WebCommonStackProps) {
        const { appName, web, dns, awsEnvironment } = props;

        new WebPipeline(this, 'Pipeline', {
            appName,
            web,
            dns,
            awsAccount: awsEnvironment.account,
        });
    }
}

interface WebCommonStageProps extends cdk.StageProps, WebCommonStackProps {}

/** Stage in infrastructure pipeline responsible for building common web constructs. */
export class WebCommonStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: WebCommonStageProps) {
        super(scope, id, props);

        new WebCommonStack(this, 'WebCommonStack', props);
    }
}
