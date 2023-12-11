import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Application } from './application';
import { BackendPipeline } from './pipeline';
import { AppConfig } from '../../config/config_def';

interface BackendServiceStackProps extends cdk.StackProps, AppConfig {}

export class BackendServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BackendServiceStackProps) {
        super(scope, id, props);

        const ebApp = new Application(this, 'Backend-Application', {
            ...props,
        });

        const pipeline = new BackendPipeline(this, 'Backend-Pipeline', {
            ...props,
        });

        pipeline.node.addDependency(ebApp);
    }
}

interface BackendServiceStageProps extends cdk.StageProps {
    stackProps: BackendServiceStackProps;
}

export class BackendServiceStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: BackendServiceStageProps) {
        super(scope, id, props);

        new BackendServiceStack(this, 'BackendServiceStack', props.stackProps);
    }
}
