import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ElasticBeanstalkApp } from './eb_application';
import { BackendPipeline } from './pipeline';
import { BackendConfig, DnsConfig } from '../../bin/config_def';

interface BackendServiceStackProps extends cdk.StackProps, BackendConfig {
    appName: string;
    dns?: DnsConfig;
}

export class BackendServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BackendServiceStackProps) {
        super(scope, id, props);

        const ebApp = new ElasticBeanstalkApp(this, 'Backend-EB-App', {
            ...props,
        });

        const pipeline = new BackendPipeline(this, 'Backend-Pipeline', {
            ...props,
        });

        pipeline.node.addDependency(ebApp);
    }
}

interface BackendServiceStageProps extends cdk.StageProps {
    stackProps: BackendServiceStackProps
}

export class BackendServiceStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: BackendServiceStageProps) {
        super(scope, id, props);

        new BackendServiceStack(this, 'BackendServiceStack', props.stackProps);
    }
}
