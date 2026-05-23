export function validateJsonSchema(value, schema, opts = {}) {
    const issues = [];
    const unsupported = [];
    walk(value, schema, opts.path || '$', issues, unsupported);
    return {
        ok: issues.length === 0 && unsupported.length === 0,
        issues,
        unsupported
    };
}
export function validateJsonSchemaRecursive(value, schema) {
    const expanded = resolveLocalRefs(schema, schema);
    const result = validateJsonSchema(value, expanded);
    return {
        ok: result.ok,
        issues: [...result.issues, ...result.unsupported].map((row) => `${row.path}:${row.code}`)
    };
}
function walk(value, schema = {}, jsonPath, issues, unsupported) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        unsupported.push(issue(jsonPath, 'schema_not_object', 'Schema node must be an object.'));
        return;
    }
    if ('$ref' in schema) {
        unsupported.push(issue(jsonPath, 'ref_unsupported', 'External and internal $ref resolution is not supported by the lightweight runtime validator.'));
        return;
    }
    if (Array.isArray(schema.oneOf)) {
        const matches = schema.oneOf.map((branch) => validateBranch(value, branch, jsonPath));
        const count = matches.filter((result) => result.ok).length;
        if (count !== 1)
            issues.push(issue(jsonPath, 'oneOf', `Expected exactly one oneOf branch to match, got ${count}.`));
        return;
    }
    if (Array.isArray(schema.anyOf)) {
        const matches = schema.anyOf.map((branch) => validateBranch(value, branch, jsonPath));
        if (!matches.some((result) => result.ok))
            issues.push(issue(jsonPath, 'anyOf', 'Expected at least one anyOf branch to match.'));
        return;
    }
    if ('const' in schema && !deepEqual(value, schema.const)) {
        issues.push(issue(jsonPath, 'const', `Expected const ${JSON.stringify(schema.const)}.`));
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((entry) => deepEqual(value, entry))) {
        issues.push(issue(jsonPath, 'enum', `Expected one of ${JSON.stringify(schema.enum)}.`));
    }
    if (schema.type !== undefined && !matchesType(value, schema.type)) {
        issues.push(issue(jsonPath, 'type', `Expected type ${JSON.stringify(schema.type)}, got ${runtimeType(value)}.`));
        return;
    }
    const type = effectiveType(value, schema);
    if (type === 'object')
        validateObject(value, schema, jsonPath, issues, unsupported);
    if (type === 'array')
        validateArray(value, schema, jsonPath, issues, unsupported);
    if (type === 'string')
        validateString(String(value), schema, jsonPath, issues);
    if (type === 'number' || type === 'integer')
        validateNumber(Number(value), schema, jsonPath, issues);
}
function validateObject(value, schema, jsonPath, issues, unsupported) {
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const key of required) {
        if (!Object.hasOwn(value, key))
            issues.push(issue(`${jsonPath}.${key}`, 'required', 'Required property is missing.'));
    }
    for (const [key, child] of Object.entries(properties)) {
        if (Object.hasOwn(value, key))
            walk(value[key], child, `${jsonPath}.${escapePath(key)}`, issues, unsupported);
    }
    if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
            if (!Object.hasOwn(properties, key))
                issues.push(issue(`${jsonPath}.${escapePath(key)}`, 'additionalProperties', 'Unexpected property.'));
        }
    }
    else if (isRecord(schema.additionalProperties)) {
        for (const key of Object.keys(value)) {
            if (!Object.hasOwn(properties, key))
                walk(value[key], schema.additionalProperties, `${jsonPath}.${escapePath(key)}`, issues, unsupported);
        }
    }
}
function validateArray(value, schema, jsonPath, issues, unsupported) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
        issues.push(issue(jsonPath, 'minItems', `Expected at least ${schema.minItems} items.`));
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
        issues.push(issue(jsonPath, 'maxItems', `Expected at most ${schema.maxItems} items.`));
    if (schema.uniqueItems === true) {
        const seen = new Set(value.map((entry) => JSON.stringify(entry)));
        if (seen.size !== value.length)
            issues.push(issue(jsonPath, 'uniqueItems', 'Expected unique array items.'));
    }
    if (Array.isArray(schema.prefixItems)) {
        schema.prefixItems.forEach((itemSchema, index) => {
            if (index < value.length && isRecord(itemSchema))
                walk(value[index], itemSchema, `${jsonPath}[${index}]`, issues, unsupported);
        });
    }
    if (isRecord(schema.items)) {
        value.forEach((entry, index) => walk(entry, schema.items, `${jsonPath}[${index}]`, issues, unsupported));
    }
    else if (Array.isArray(schema.prefixItems)) {
        value.forEach((entry, index) => {
            const itemSchema = schema.prefixItems[index];
            if (isRecord(itemSchema))
                walk(entry, itemSchema, `${jsonPath}[${index}]`, issues, unsupported);
        });
    }
    else if (Array.isArray(schema.items)) {
        value.forEach((entry, index) => {
            const itemSchema = schema.items[index];
            if (isRecord(itemSchema))
                walk(entry, itemSchema, `${jsonPath}[${index}]`, issues, unsupported);
        });
    }
}
function resolveLocalRefs(schema, root, seen = new Set()) {
    if (!isRecord(schema))
        return schema;
    if (typeof schema.$ref === 'string') {
        const ref = schema.$ref;
        if (seen.has(ref))
            return schema;
        const resolved = resolvePointer(root, ref);
        if (isRecord(resolved))
            return resolveLocalRefs(resolved, root, new Set([...seen, ref]));
        return schema;
    }
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
        if (Array.isArray(value))
            out[key] = value.map((item) => isRecord(item) ? resolveLocalRefs(item, root, seen) : item);
        else
            out[key] = isRecord(value) ? resolveLocalRefs(value, root, seen) : value;
    }
    return out;
}
function resolvePointer(root, ref) {
    if (!ref.startsWith('#/'))
        return null;
    return ref.slice(2).split('/').reduce((node, raw) => {
        if (!node || typeof node !== 'object')
            return null;
        const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
        return node[key];
    }, root);
}
function validateString(value, schema, jsonPath, issues) {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
        issues.push(issue(jsonPath, 'minLength', `Expected length >= ${schema.minLength}.`));
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
        issues.push(issue(jsonPath, 'maxLength', `Expected length <= ${schema.maxLength}.`));
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
        issues.push(issue(jsonPath, 'pattern', `Expected string to match /${schema.pattern}/.`));
}
function validateNumber(value, schema, jsonPath, issues) {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
        issues.push(issue(jsonPath, 'minimum', `Expected value >= ${schema.minimum}.`));
    if (typeof schema.maximum === 'number' && value > schema.maximum)
        issues.push(issue(jsonPath, 'maximum', `Expected value <= ${schema.maximum}.`));
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
        issues.push(issue(jsonPath, 'exclusiveMinimum', `Expected value > ${schema.exclusiveMinimum}.`));
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
        issues.push(issue(jsonPath, 'exclusiveMaximum', `Expected value < ${schema.exclusiveMaximum}.`));
    if (schema.type === 'integer' && !Number.isInteger(value))
        issues.push(issue(jsonPath, 'integer', 'Expected integer value.'));
}
function validateBranch(value, branch, jsonPath) {
    const result = validateJsonSchema(value, isRecord(branch) ? branch : {}, { path: jsonPath });
    return { ok: result.ok, result };
}
function matchesType(value, expected) {
    const types = Array.isArray(expected) ? expected.map(String) : [String(expected)];
    return types.some((type) => {
        if (type === 'array')
            return Array.isArray(value);
        if (type === 'integer')
            return typeof value === 'number' && Number.isInteger(value);
        if (type === 'number')
            return typeof value === 'number' && Number.isFinite(value);
        if (type === 'object')
            return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
        if (type === 'null')
            return value === null;
        return typeof value === type;
    });
}
function effectiveType(value, schema) {
    if (schema.type === 'integer')
        return 'integer';
    if (schema.type === 'number')
        return 'number';
    if (Array.isArray(value))
        return 'array';
    if (Boolean(value) && typeof value === 'object')
        return 'object';
    return runtimeType(value);
}
function runtimeType(value) {
    if (Array.isArray(value))
        return 'array';
    if (value === null)
        return 'null';
    if (typeof value === 'number' && Number.isInteger(value))
        return 'integer';
    return typeof value;
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function escapePath(value) {
    return /^[A-Za-z_$][\w$]*$/.test(value) ? value : JSON.stringify(value);
}
function issue(path, code, message) {
    return { path, code, message };
}
function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
//# sourceMappingURL=json-schema-validator.js.map