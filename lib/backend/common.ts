import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { AppConfig } from '../config/config_def';
import Pipeline from './pipeline';

export interface CommonStackProps extends AppConfig {
    stackProps: cdk.StackProps;
}

export class CommonStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CommonStackProps) {
        super(scope, id, props.stackProps);

        this.createPipeline(props);
    }

    private createPipeline(props: CommonStackProps) {
        const { appName, backend } = props;

        new Pipeline(this, `${props.appName}-BackendPipeline`, { appName, backend });
    }
}

interface CommonStageProps extends cdk.StageProps, CommonStackProps {}

export class CommonStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: CommonStageProps) {
        super(scope, id, props);

        new CommonStack(this, `${props.appName}-CommonStack`, props);
    }
}
