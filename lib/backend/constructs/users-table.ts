import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface UsersTableProps {
    environmentName: string;
    instanceRole: iam.IRole;
    allowLocalAccess: boolean;
}

export class UsersTableConstruct extends Construct {
    readonly table: dynamodb.Table;

    constructor(scope: Construct, id: string, props: UsersTableProps) {
        super(scope, id);

        this.table = new dynamodb.Table(this, 'UsersTable', {
            tableName: `games-${props.environmentName.toLowerCase()}-users`,
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.table.addGlobalSecondaryIndex({
            indexName: 'displayName-index',
            partitionKey: { name: 'displayName', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        });

        this.table.grantReadWriteData(props.instanceRole);

        if (props.allowLocalAccess) {
            const localDevRole = new iam.Role(this, 'LocalDevRole', {
                roleName: `games-${props.environmentName.toLowerCase()}-local-dev`,
                assumedBy: new iam.AccountPrincipal(cdk.Stack.of(this).account),
                description: `Allows local development access to ${props.environmentName} DynamoDB tables`,
            });
            this.table.grantReadWriteData(localDevRole);
        }
    }
}
