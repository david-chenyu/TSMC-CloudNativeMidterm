import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

class MyStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for the ECS cluster and the Redis cache
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      cidr: '10.0.0.0/16',
      natGateways: 1,
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'MyAlb', {
      vpc,
      internetFacing: true,
    });

    // ECS cluster with auto scaling EC2 instances
    const ecsCluster = new ecs.Cluster(this, 'MyEcsCluster', {
      vpc,
      capacityProviders: ['FARGATE', 'EC2'],
    });

    const autoScalingGroup = ecsCluster.addCapacity('MyCapacity', {
      instanceType: new ec2.InstanceType('t2.micro'),
      minCapacity: 4,
      maxCapacity: 10,
    });
    
    // Configure the ALB listener and target group
    const listener = alb.addListener('MyListener', {
        port: 80,
        open: true,
        });

    const targetGroup = listener.addTargets('MyTargetGroup', {
        port: 80,
        targets: [new ecs.EcsTarget(autoScalingGroup)],
        });
    
    // Allow incoming traffic from the ALB to the ECS instances
    autoScalingGroup.connections.allowFrom(alb, ec2.Port.tcp(80), 'ALB access');
    
    // Elastic Container Registry
    const ecr = new ecs.Repository(this, 'MyEcr', {
      repositoryName: 'my-repo',
    });

    // Lambda function
    const lambdaFn = new lambda.Function(this, 'MyLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });

    // ElastiCache for Redis
    const redis = new elasticache.CfnCacheCluster(this, 'MyRedis', {
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [vpc.vpcDefaultSecurityGroup],
      cacheSubnetGroupName: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE,
      }).subnetIds.join(','),
    });

    // DynamoDB table
    const dynamoTable = new dynamodb.Table(this, 'MyDynamoTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Allow the Lambda function to read and write to the DynamoDB table
    dynamoTable.grantReadWriteData(lambdaFn);

    // Allow the ECS instances to connect to the Redis cache
    autoScalingGroup.connections.allowToDefaultPort(redis);

  }
}
