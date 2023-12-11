import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';

interface EbAppProps {
    appName: string;
}

export class EbApplication extends Construct {
    readonly applicationName: string;
    readonly serviceRole: iam.IRole;
    readonly instanceRole: iam.Role;
    readonly instanceProfileName: string;

    constructor(scope: Construct, id: string, props: EbAppProps) {
        super(scope, id);

        this.instanceRole = new iam.Role(this, `${props.appName}-elasticbeanstalk-ec2-role`, {
            roleName: `${props.appName}-instance-role`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });
        this.instanceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier'),
        );

        this.instanceProfileName = `${props.appName}-instance-profile`;
        const instanceProfile = new iam.CfnInstanceProfile(
            this,
            `${props.appName}-elasticbeanstalk-instance-profile`,
            {
                instanceProfileName: this.instanceProfileName,
                roles: [this.instanceRole.roleName],
            },
        );

        this.serviceRole = new iam.Role(this, `${props.appName}-elasticbeanstalk-service-role`, {
            roleName: `${props.appName}-service-role`,
            assumedBy: new iam.ServicePrincipal('elasticbeanstalk.amazonaws.com'),
        });
        this.serviceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy',
            ),
        );
        this.serviceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'service-role/AWSElasticBeanstalkEnhancedHealth',
            ),
        );

        this.applicationName = props.appName;
        const ebApp = new elasticbeanstalk.CfnApplication(
            this,
            `EBApplication_${this.applicationName}`,
            {
                applicationName: this.applicationName,
                description: `Application for ${this.applicationName}. Managed by CDK.`,
                resourceLifecycleConfig: {
                    serviceRole: this.serviceRole.roleArn,
                    versionLifecycleConfig: {
                        maxCountRule: {
                            deleteSourceFromS3: true,
                            maxCount: 3,
                            enabled: true,
                        },
                    },
                },
            },
        );

        ebApp.addDependency(instanceProfile);
    }
}
