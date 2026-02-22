import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { AppConfig } from '../config/config_def';
import ApplicationPipeline from './application_pipeline';

export interface CommonStackProps extends AppConfig {
    stackProps: cdk.StackProps;
}

/** Constructs used by all environments, like the Application Pipeline (deploying code to all environments). */
export class CommonStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CommonStackProps) {
        super(scope, id, props.stackProps);

        this.createPipeline(props);
    }

    private createPipeline(props: CommonStackProps) {
        const { appName, backend } = props;

        new ApplicationPipeline(this, 'Pipeline', { appName, backend });
    }
}

interface CommonStageProps extends cdk.StageProps, CommonStackProps {}

/** Stage in infrastructure pipeline responsible for building common constructs. */
export class CommonStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: CommonStageProps) {
        super(scope, id, props);

        new CommonStack(this, 'CommonStack', props);
    }
}
