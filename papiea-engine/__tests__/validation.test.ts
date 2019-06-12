import "jest"
import { Validator } from "../src/validator";
import { getLocationDataDescription, ValidationBuilder } from "./test_data_factory";
import { Maybe } from "../src/utils/utils";

describe("Validation tests", () => {

    const locationDataDescription = getLocationDataDescription();
    const trimmedLocationDataDescription = Object.assign({}, locationDataDescription);
    const kind_name = Object.keys(locationDataDescription)[0];
    const maybeLocation = Maybe.fromValue(Object.values(locationDataDescription)[0]);

    test("Basic validation should succeed", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        })
    });

    test("Missing required parameter 'x'", async (done) => {
        const entity = {
            spec: {
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        }, true)
    });

    test("Additional expected parameter 'z'", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                z: 20
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        })
    });

    test("Additional unexpected parameter 'k'", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                k: 20
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        }, true)
    });

    test("Parameter x with wrong type string", async (done) => {
        const entity = {
            spec: {
                x: "Totally not an integer",
                y: 11,
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        }, true)
    });

    test("Additional Nested parameter", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: 10
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        })
    });

    test("Additional Nested parameter with wrong type", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: "Totally not a number"
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        }, true)
    });

    test("Additional Nested parameter with wrong type", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: "Totally not a number"
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocation, trimmedLocationDataDescription)
        }, true)
    });

    let locationDataDescriptionStringParam = getLocationDataDescription();
    const edited_kind_name = Object.keys(locationDataDescriptionStringParam)[0];
    locationDataDescriptionStringParam[edited_kind_name].properties.x.type = "string";
    const trimmedLocationDataDescriptionStringParam = Object.assign({}, locationDataDescription);
    const maybeLocationStringParam = Maybe.fromValue(Object.values(locationDataDescriptionStringParam)[0]);

    test("Basic validation with string param should succeed", async (done) => {
        const entity = {
            spec: {
                x: "String",
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocationStringParam, trimmedLocationDataDescriptionStringParam)
        })
    });

    test("Parameter x with wrong type number", async (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        const validator = new Validator(true);
        try_validate(() => {
            validator.validate(entity.spec, maybeLocationStringParam, trimmedLocationDataDescriptionStringParam)
        }, true)
    });
});