FROM nutanix-docker.jfrog.io/papiea:yarn-base AS debug

COPY . /code
WORKDIR /code/papiea-engine
RUN cd /code \
    && apt-get update \
    && apt-get install -y build-essential \
    && apt-get install python3.8 python3-pip python3.8-dev -y \
    && npm --prefix papiea-engine run build-clj

# Install yarn
RUN curl -o- -L yarnpkg.com/install.sh | bash
ENV PATH="${PATH}:/root/.yarn/bin"

RUN cd /code && make

FROM node:14.8.0 AS builder

COPY --from=debug /code /code

# Install yarn
RUN curl -o- -L yarnpkg.com/install.sh | bash
ENV PATH="${PATH}:/root/.yarn/bin"

RUN cd /code && make remove_dev_deps

RUN rm -rf /code/papiea-engine/__tests__ && rm -rf /code/papiea-engine/__benchmarks__

FROM ubuntu:18.04

COPY --from=builder /code/papiea-engine /code/papiea-engine
WORKDIR /code/papiea-engine

# Install node
RUN cd /code \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install curl -y \
    && curl -sL https://deb.nodesource.com/setup_10.x -o nodesource_setup.sh \
    && bash nodesource_setup.sh \
    && apt-get install nodejs -y

# Install yarn
RUN curl -o- -L yarnpkg.com/install.sh | bash
ENV PATH="${PATH}:/root/.yarn/bin"

CMD /bin/bash -c "bash install_certificates.sh & yarn run start_differ & yarn run start"
