#!/bin/sh

set -e

mkdir -p certs
cd certs

if [ ! -f ca.crt ]; then
    # generate ca key and certificate
    openssl genrsa -out ca.key 4096
    openssl req -x509 -new -nodes -key ca.key -days 365 -out ca.crt -subj "/C=US/ST=California/L=SanJose/O=Nutanix/OU=CA/CN=papiea"
fi

if [ ! -f server.key ]; then
    # generate server key
    openssl genrsa -out server.key 4096
fi

if [ ! -f server.crt ]; then
    # generate server cert signed by ca
    openssl req -new -key server.key -out server.csr -subj "/C=US/ST=California/L=SanJose/O=Nutanix/OU=Papiea/CN=localhost"
    openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365
fi

# go back to papiea-engine dir
cd ..

if [ -d "../papiea-client" ]
then
    # this is out of if statement to account for cleanup failures
    # save the ca cert in papiea client
    cd ../papiea-client
    mkdir -p certs
    cp ../papiea-engine/certs/ca.crt certs/
fi

if [ -d "../papiea-sdk" ]
then
    # save the ca cert in python sdk
    cd ../papiea-sdk/python/e2e_tests/
    ln -sf ../../../papiea-client/certs ./

    # save the ca cert in typescript sdk
    cd ../../typescript
    ln -sf ../../papiea-client/certs ./
fi