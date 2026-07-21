pipeline {
    agent any

    environment {
        IMAGE_NAME = "mkhan777717/eduvantix-backend"
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Generate Prisma Client') {
            steps {
                sh 'npx prisma generate'
            }
        }

        stage('Run Migrations') {
            steps {
                withCredentials([string(credentialsId: 'DATABASE_URL', variable: 'DATABASE_URL')]) {
                    sh 'npx prisma migrate deploy'
                }
            }
        }

        stage('Test') {
            steps {
                sh 'npm test || true'   // remove "|| true" once you have real tests
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    docker.build("${IMAGE_NAME}:${IMAGE_TAG}", ".")
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-creds') {
                        docker.image("${IMAGE_NAME}:${IMAGE_TAG}").push()
                        docker.image("${IMAGE_NAME}:${IMAGE_TAG}").push('latest')
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([string(credentialsId: 'DATABASE_URL', variable: 'DATABASE_URL')]) {
                    sh """
                      docker pull ${IMAGE_NAME}:${IMAGE_TAG}
                      docker stop eduvantix-backend || true
                      docker rm eduvantix-backend || true
                      docker run -d --name eduvantix-backend \
                        -p 5001:5001 \
                        -e DATABASE_URL=\$DATABASE_URL \
                        ${IMAGE_NAME}:${IMAGE_TAG}
                    """
                }
            }
        }
    }

    post {
        always {
            script {
                if (env.WORKSPACE) {
                    sh 'docker system prune -f || true'
                }
            }
        }
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed.'
        }
    }
}
