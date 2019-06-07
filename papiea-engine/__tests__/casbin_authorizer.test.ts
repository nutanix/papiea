import "jest"
import { UserAuthInfo } from "../src/auth/authn";
import { PermissionDeniedError, Action, ReadAction, CreateAction, UpdateAction, DeleteAction } from "../src/auth/authz";
import { CasbinAuthorizer } from "../src/auth/casbin";
import { resolve } from "path";


describe("Casbin authorizer tests", () => {
    const pathToModel: string = resolve(__dirname, "../src/auth/default_provider_model.txt");
    const pathToPolicy: string = resolve(__dirname, "../src/auth/provider_policy_example.txt");
    const authorizer = new CasbinAuthorizer(pathToModel, pathToPolicy);

    beforeAll(async () => {
        await authorizer.init();
    });

    afterAll(async () => {
    });

    function actionShouldFail(user: UserAuthInfo, object: any, action: Action, done: any) {
        authorizer.checkPermission(user, object, action).then(_ => {
            done.fail();
        }).catch(e => {
            if (e.constructor === PermissionDeniedError) {
                done();
            } else {
                done.fail(e);
            }
        });
    }

    function actionShouldSucceed(user: UserAuthInfo, object: any, action: Action, done: any) {
        authorizer.checkPermission(user, object, action).then(_ => {
            done();
        }).catch(e => {
            done.fail(e);
        });
    }

    test("Alice fails to write an kind_3 of another user without rights", done => {
        actionShouldFail(
            { "owner": "alice", "tenant": "1" },
            { "metadata": { "extension": { "owner": "1alice1" }, "kind": "kind_3" } },
            CreateAction,
            done
        );
    });

    test("Alice fails to delete her own kind_4, which is explicitly denied", done => {
        actionShouldFail(
            { "owner": "alice", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_4" } },
            DeleteAction,
            done
        );
    });

    test("Alice succeeds reading her own imaged host which is explicitly allowed", done => {
        actionShouldSucceed(
            { "owner": "alice", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_3" } },
            ReadAction,
            done
        );
    });

    test("Bob succeeds reading alice's kind_1, which is allowed to read by everyone using the default 'reader_group'", done => {
        actionShouldSucceed(
            { "owner": "bob", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_1" } },
            ReadAction,
            done
        );
    });

    test("Bob fails to delete a kind_1 since no rule allows for it", done => {
        actionShouldFail(
            { "owner": "bob", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_1" } },
            DeleteAction,
            done
        );
    });

    test("Alice succeeds reading a kind_2 owned by her since it was explicitly allowed", done => {
        actionShouldSucceed(
            { "owner": "alice", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_2" } },
            ReadAction,
            done
        );
    });

    test("Bill succeeds reading alice's kind_2 since the reader_group allows it for everyone", done => {
        actionShouldSucceed(
            { "owner": "bill", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_2" } },
            ReadAction,
            done
        );
    });

    test("Bill fails deleting alice's kind_2, since no rule allows it", done => {
        actionShouldFail(
            { "owner": "bill", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_2" } },
            DeleteAction,
            done
        );
    });

    test("Bill fails deleting alice's kind_3, since the standard_group only allows deleting to owners", done => {
        actionShouldFail(
            { "owner": "bill", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_3" } },
            DeleteAction,
            done
        );
    });

    test("Bill succeeds deleting his own kind_3, since the standard_group only allows deleting to owners", done => {
        actionShouldSucceed(
            { "owner": "bill", "tenant": "1" },
            { "metadata": { "extension": { "owner": "bill" }, "kind": "kind_3" } },
            DeleteAction,
            done
        );
    });

    test("Anonymous user is denied reading alice's kind_2, by a rule denying anything of anyone's entity", done => {
        actionShouldFail(
            { "owner": "anonymous" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_2" } },
            ReadAction,
            done
        );
    });

    test("Admin can delete alice's kind_3 since admin belongs to the admin's group", done => {
        actionShouldSucceed(
            { "owner": "admin" },
            { "metadata": { "extension": { "owner": "alice" }, "kind": "kind_3" } },
            DeleteAction,
            done
        );
    });

    test("Rick can delete alice's kind_3 since he is in her tenant and is a part of tenant_group", done => {
        actionShouldSucceed(
            { "owner": "rick", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice", "tenant_uuid": "1" }, "kind": "kind_3" } },
            DeleteAction,
            done
        );
    });

    test("Rick fails to delete alice's kind_4 since he is in her tenant and is a part of tenant_group but the rule denies deleteing", done => {
        actionShouldFail(
            { "owner": "rick", "tenant": "1" },
            { "metadata": { "extension": { "owner": "alice", "tenant_uuid": "1" }, "kind": "kind_4" } },
            DeleteAction,
            done
        );
    });
});

describe("Casbin authorizer tests for default provider policy", () => {
    const pathToModel: string = resolve(__dirname, "../src/auth/default_provider_model.txt");
    const pathToPolicy: string = resolve(__dirname, "../src/auth/default_provider_policy.txt");
    const authorizer = new CasbinAuthorizer(pathToModel, pathToPolicy);

    beforeAll(async () => {
        await authorizer.init();
    });

    afterAll(async () => {
    });

    function actionShouldFail(user: UserAuthInfo, object: any, action: Action, done: any) {
        authorizer.checkPermission(user, object, action).then(_ => {
            done.fail();
        }).catch(e => {
            if (e.constructor === PermissionDeniedError) {
                done();
            } else {
                done.fail(e);
            }
        });
    }

    function actionShouldSucceed(user: UserAuthInfo, object: any, action: Action, done: any) {
        authorizer.checkPermission(user, object, action).then(_ => {
            done();
        }).catch(e => {
            done.fail(e);
        });
    }

    describe('admin user', () => {
        describe('has access to everything', () => {
            describe('some_kind', () => {
                const kind = 'some_kind'
                test("Read", done => {
                    actionShouldSucceed(
                        { owner: 'admin' },
                        { metadata: { extension: { owner: 'alice' }, kind } },
                        ReadAction,
                        done
                    )
                })
                test("Create", done => {
                    actionShouldSucceed(
                        { owner: 'admin' },
                        { metadata: { extension: { owner: 'alice' }, kind } },
                        CreateAction,
                        done
                    )
                })
                test("Update", done => {
                    actionShouldSucceed(
                        { owner: 'admin' },
                        { metadata: { extension: { owner: 'alice' }, kind } },
                        UpdateAction,
                        done
                    )
                })
                test("Delete", done => {
                    actionShouldSucceed(
                        { owner: 'admin' },
                        { metadata: { extension: { owner: 'alice' }, kind } },
                        DeleteAction,
                        done
                    )
                })
            })
        })
    })

    describe('anonymous user', () => {
        describe('has access to nothing', () => {
            describe('his own (should never have any anyway)', () => {
                describe('some_kind', () => {
                    const kind = 'some_kind'
                    test("Read", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'anonymous' }, kind } },
                            ReadAction,
                            done
                        )
                    })
                    test("Create", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'anonymous' }, kind } },
                            CreateAction,
                            done
                        )
                    })
                    test("Update", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'anonymous' }, kind } },
                            UpdateAction,
                            done
                        )
                    })
                    test("Delete", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'anonymous' }, kind } },
                            DeleteAction,
                            done
                        )
                    })
                })
})
            describe('other owners', () => {
                describe('some_kind', () => {
                    const kind = 'some_kind'
                    test("Read", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'alice' }, kind } },
                            ReadAction,
                            done
                        )
                    })
                    test("Create", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'alice' }, kind } },
                            CreateAction,
                            done
                        )
                    })
                    test("Update", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'alice' }, kind } },
                            UpdateAction,
                            done
                        )
                    })
                    test("Delete", done => {
                        actionShouldFail(
                            { owner: 'anonymous' },
                            { metadata: { extension: { owner: 'alice' }, kind } },
                            DeleteAction,
                            done
                        )
                    })
                })
            })
        })
    })
});