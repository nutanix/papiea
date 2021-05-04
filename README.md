# papiea-js

<img src="https://upload.wikimedia.org/wikipedia/commons/1/13/Papaya.svg" width="150" height="150">

Papiea, pronounced like the fruit, is an Intent engine based on perscriptions or recipes for handling differences
between intended state and real world state.

## Design document

Please see [Papiea's design document](https://nutanix.github.io/papiea/Papiea-design.html)

## Papiea versions:

| Component  | Version |
| ------------- | ------------- |
  | Engine (docker) | nutanix-docker.jfrog.io/papiea:0.9.60_2260 |
  | Client/SDK (typescript)  | 0.9.60+2260 |
  | Client/SDK (python)  | 0.9.60+2260 |

## Build Instructions Papiea

Since papiea consists of multiple package you need to build them all
separately or use a set of commands to build them all

1. In the project root install and build all dependencies `make build_all`. (Note you need to have yarn installed
, how to install yarn https://yarnpkg.com/getting-started/install)

## Local Development Instructions Papiea-Engine

Papiea-Engine is the main component that serves web requests and integrates intentful engine
with entity information stores in a database. Make sure that you have Docker and Docker-compose since they are required to run Papiea-Engine

1. In the project root cd into papiea engine package `cd papiea-engine`

2. To start a container `docker-compose up -d`

Papiea-Engine will now be running on port `3000` inside the container and will use port `3333` externally

To stop a container

1. `docker-compose stop`

## Debug configuration Papiea-Engine

Instead of using usual `docker-compose up` in papiea-engine dir, use `docker-compose -f docker-compose-debug.yml up` to enable hot-reload and debugger listening on port `9229`
See [Attaching to node js using VS Code](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_attaching-to-nodejs)
See [Attaching to node js using Intellij](https://www.jetbrains.com/help/pycharm/running-and-debugging-node-js.html#a34dc5da)

## Benchmarking Local Papiea

1. Start papiea using `docker-compose up` in the papiea-engine dir

2. `docker-compose exec papiea-engine bash -c 'cd __benchmarks__ && npm i && npm run bench-local'`

## Benchmarking Dedicated Papiea

1. From project root `cd papiea-engine/__benchmarks__`

2. Install dependencies by `yarn` (Note you need to have yarn installed https://yarnpkg.com/getting-started/install)

3. `npm run bench -- {PAPIEA_URL} {PUBLIC_HOST} {PUBLIC_PORT}` where PAPIEA_URL is a dedicated papiea_url, PUBLIC_HOST is your sdk publicly visible hostname, PUBLIC_PORT is your sdk publicly visible port

OPTIONALLY: you can use AWS Cloudformation stack to setup benchmark environment, to do that you:

1. Upload `papiea-engine/__benchmarks__/aws_template/benchmark.json` as a template or use `https://papiea-bucket.s3-us-west-2.amazonaws.com/benchmark.json`

2. SSH to mongo-instance 

3. Do `cd mongo && docker-compose -f docker-compose-mongo.yml up -d`

3. SSH to papiea-instance 

4. `export MONGO_URL='mongod://${MONGO_INSTANCE_PUBLIC_IP}:27017'`

5. `git clone https://github.com/nutanix/papiea-js.git`

6. `cd papiea-js/papiea-engine`

7. `docker-compose -f docker-compose-benchmark.yml up -d`

Now you can use your `${PAPIEA_INSTANCE_PUBLIC_IP}:3333` as PAPIEA_URL in benchmarks

## Environment Papiea-Engine

Papiea uses configuration file to apply settings. Sample config file is located in `papiea-engine/papiea-config.yaml`.
The configuration parameters are following:

```
# Server port (default - 3000)
server_port: number,

# Public facing papiea address (default - "http://localhost:3000")
public_addr: string,

# Mongo url (default - "mongodb://mongo:27017")
mongo_url: string,

# Mongo Db collection name to store papiea entities in (default - "papiea")
mongo_db: string,

# Papiea Admin S2S key (default - "")
admin_key: string,

# Papiea debug mode toggle (default - true)
debug: boolean,

# Default logging level for papiea (default - "info")
logging_level: string,

# Size of batch of random entities to be added to diff resolution each N seconds (default - 5)
entity_batch_size: number,

# Deleted watcher persists in database for this amount of seconds (default - 100)
deleted_watcher_persist_time: number

# Delay for polling entity changes in database in milliseconds (default - 250)
entity_poll_delay: number

# Delay for observing intent watcher status change in milliseconds (default - 1500)
intent_resolve_delay: number

# Delay for rediffing watcher entities in milliseconds (default - 3000)
diff_resolve_delay: number

# Config options for logging verbosity
logging_verbosity: {

    # If set to "true" includes all fields in the request log
    verbose: boolean
    
    # Which fields to be set in request log
    fields: ['headers' | 'response_body' | 'request_body']
}

# Config options for working with Jaeger 
tracing_config: {
    reporter: {
        collectorEndpoint: string,
        agentHost: string,
        agentPort: number,
    },
    sampler: {
        type: string,
        param: number
    },
    # Log messages to standard logger output (default: false)
    logMessages: boolean
}
```

A set of these variables might be used to override the preceeding config file params.
General pattern is - PAPIEA_{VARIABLE_NAME_CAPITALIZED}

* `PAPIEA_MONGO_URL`
* `PAPIEA_PUBLIC_URL`
* `PAPIEA_LOGGING_LEVEL`
* `PAPIEA_DEBUG`
* `PAPIEA_ADMIN_KEY`

Additional env variables:

* `HOT_RELOAD` - use nodemon to autoreload papiea on code changes
* `PAPIEA_CONFIG_PATH` - path to config file (default - `../../papiea-config.yaml` rootDir is counted from `papiea
-engine/src/utils`)

## Tracing

To use tracing in debug mode:
1. Use docker-compose-debug.yml
2. Access http://localhost:16686 to get Jaeger UI with all the traces

To use tracing in production:
1. Specify config parameters for production usage (possible params declated in Environment section of README)


## CLJS instructions

For now this clojurescript library is embedded, but it may end up in a different repository and will be exposed as a regular npm package which will be imported through npm. Until this happens, here are the instructions for developing this library:

1. Make sure `leiningen` is installed (follow [leiningen installation](https://github.com/technomancy/leiningen#installation))
2. To use live repl with clojurescript do the following:

    ```bash
    cd papiea-lib-clj
    lein repl
    ```

    and inside the repl type:

    ```clojure
    (require 'cljs.repl.nashorn)
    (cider.piggieback/cljs-repl (cljs.repl.nashorn/repl-env))
    ```

    Then go to emacs with cider installed
    ([Cider Installation](https://github.com/clojure-emacs/cider#installation)), do `M+x cider-connect-cljs`,
    select the host where the repl is running (usually localhost, but can be run anywhere.
    Use `.ssh/config` to name that host), then select `node` as the running environment and you should have a repl.
    Debugging is not yet working in cljs, but I simply use regular clojure if I need to live debug for now.

## Python instructions

For now you can use either:

1. Commit hash to download Python papiea-sdk 

2. Nutanix JFrog artifactory

To use Python SDK from commit hash do:

1. Add this line to your requirements.txt
`-e git+https://github.com/nutanix/papiea.git@<commit-hash>#egg=papiea-sdk&subdirectory=papiea-sdk/python`

To use Python SDK from Nutanix JFrog artifactory following steps are required:

1. Do `pip install -r requirements.txt`  (Add aiohttp>=3.6.2 and jaeger-client>=4.4.0 if not present)

2. Manually install papiea-sdk from jfrog local repo `pip install papiea-sdk===0.8.5+1748 -i https://repository-login:repository-password@nutanix.jfrog.io/nutanix/api/pypi/pypi-local/simple`

3. Use papiea-sdk

## Issuing a bug report

While issuing a bug report please make sure you created an issue https://github.com/nutanix/papiea/issues with the 
following info (make sure to use the right template):

1. General description of the error

2. Code samples or path which were used during problematic scenario execution

3. Prerequisites: yaml definitions for spec, metadata extension, auth info if present

4. Steps that caused the unwanted scenario
   e.g. Defined a provider X, with procedure Y, provided input of spec
   `{x: 10, y: 20}`, expected output of procedure was `{sum: 30}`, got `{sum: 10}`
   
Please make sure to:

1. Anonymize your code (no personal or corporate details present in the provided info)

2. Not link any private repositories

3. Use a bug report template

4. Give an issue label `bug`

## License and copyright

Copyright (C) 2018 Nutanix

The code in the public repositories is licensed under the Apache
license.

Licensed under the Apache License, Version 2.0 (the "License"); you
may not use this file except in compliance with the License.  You may
obtain a copy of the License at

[Apache License](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied.  See the License for the specific language governing
permissions and limitations under the License.
