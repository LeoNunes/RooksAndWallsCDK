import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ElasticBeanstalkApp } from './eb_application';


interface BackendServiceStackProps extends cdk.StackProps {
    appName: string;
    environments: {
        name: string;
        description?: string;
    }[];
};

export class BackendServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BackendServiceStackProps) {
        super(scope, id, props);

        new ElasticBeanstalkApp(this, 'Backend-EB-App', {
            appName: props.appName,
            environments: props.environments,
        });
    }
}

interface BackendServiceStageProps extends cdk.StageProps {
    stackProps: BackendServiceStackProps
};

export class BackendServiceStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: BackendServiceStageProps) {
        super(scope, id, props);

        new BackendServiceStack(this, 'BackendServiceStack', props.stackProps);
    }
}
