# Use official Node.js runtime as parent image
FROM node:20-slim

# Install compilers: g++, golang, default-jdk, python3, and python-is-python3
RUN apt-get update && apt-get install -y \
    g++ \
    golang-go \
    default-jdk \
    python3 \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy Prisma schema and generate Prisma Client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the backend source code
COPY . .

# Expose the backend port
EXPOSE 5001

# Command to run the application in production
CMD ["npm", "start"]
