import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { AppConfig, EnvironmentConfig } from '../config/config_def';

export interface CognitoProps {
    appConfig: AppConfig;
    environment: EnvironmentConfig;
    webCallbackUrls: string[];
}

export class CognitoConstruct extends Construct {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly userPoolDomain: cognito.UserPoolDomain;

    constructor(scope: Construct, id: string, props: CognitoProps) {
        super(scope, id);

        this.userPool = new cognito.UserPool(this, 'UserPool', {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            passwordPolicy: { minLength: 8 },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        const googleSecret = secretsmanager.Secret.fromSecretNameV2(
            this, 'GoogleOAuthSecret', 'games/google-oauth'
        );

        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
            userPool: this.userPool,
            clientId: googleSecret.secretValueFromJson('clientId').unsafeUnwrap(),
            clientSecretValue: googleSecret.secretValueFromJson('clientSecret'),
            scopes: ['email', 'openid', 'profile'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            },
        });

        this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            authFlows: { userSrp: true },
            oAuth: {
                flows: { authorizationCodeGrant: true },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [...props.webCallbackUrls, 'http://localhost:5173'],
                logoutUrls: [...props.webCallbackUrls, 'http://localhost:5173'],
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
        });
        this.userPoolClient.node.addDependency(googleProvider);

        this.userPoolDomain = new cognito.UserPoolDomain(this, 'Domain', {
            userPool: this.userPool,
            cognitoDomain: { domainPrefix: props.environment.auth.cognitoDomain },
        });
    }
}
