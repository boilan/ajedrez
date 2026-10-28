// node_modules/hono/dist/http-exception.js
/**
* `HTTPException` must be used when a fatal error such as authentication failure occurs.
*
* @see {@link https://hono.dev/docs/api/exception}
*
* @param {StatusCode} status - status code of HTTPException
* @param {HTTPExceptionOptions} options - options of HTTPException
* @param {HTTPExceptionOptions["res"]} options.res - response of options of HTTPException
* @param {HTTPExceptionOptions["message"]} options.message - message of options of HTTPException
* @param {HTTPExceptionOptions["cause"]} options.cause - cause of options of HTTPException
*
* @example
* ```ts
* import { HTTPException } from 'hono/http-exception'
*
* // ...
*
* app.post('/auth', async (c, next) => {
*   // authentication
*   if (authorized === false) {
*     throw new HTTPException(401, { message: 'Custom error message' })
*   }
*   await next()
* })
* ```
*/
var HTTPException = class extends Error {
	res;
	status;
	/**
	* Creates an instance of `HTTPException`.
	* @param status - HTTP status code for the exception. Defaults to 500.
	* @param options - Additional options for the exception.
	*/
	constructor(status = 500, options) {
		super(options?.message, { cause: options?.cause });
		this.res = options?.res;
		this.status = status;
	}
	/**
	* Returns the response object associated with the exception.
	* If a response object is not provided, a new response is created with the error message and status code.
	* @returns The response object.
	*/
	getResponse() {
		if (this.res) return new Response(this.res.body, {
			status: this.status,
			headers: this.res.headers
		});
		return new Response(this.message, { status: this.status });
	}
};
// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();
// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
	return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};
// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = Object.create(null)) => {
	const { all = false, dot = false } = options;
	const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
		all,
		dot
	});
	return {};
};
/**
* Parses form data from a request.
*
* @template T - The type of the parsed body data.
* @param {HonoRequest | Request} request - The request object containing form data.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {Promise<T>} The parsed body data.
*/
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const formDataPromise = bufferToFormData(await request.arrayBuffer(), headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
/**
* Converts form data to body data based on the provided options.
*
* @template T - The type of the parsed body data.
* @param {FormData} formData - The form data to convert.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {T} The converted body data.
*/
function convertFormDataToBodyData(formData, options) {
	const form = Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
/**
* Handles parsing all values for a given key, supporting multiple values as arrays.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The key to parse.
* @param {FormDataEntryValue} value - The value to assign.
*/
var handleParsingAllValues = (form, key, value) => {
	if (form[key] !== void 0) {
		if (Array.isArray(form[key])) form[key].push(value);
		else form[key] = [form[key], value];
	} else if (!key.endsWith("[]")) form[key] = value;
	else form[key] = [value];
};
/**
* Handles parsing nested values using dot notation keys.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The dot notation key.
* @param {BodyDataValue} value - The value to assign.
*/
var handleParsingNestedValues = (form, key, value, state) => {
	if (/(?:^|\.)__proto__\./.test(key)) return;
	let nestedForm = form;
	const keys = key.split(".", 34);
	if (keys.length > 33) throwNestingLimitExceeded();
	keys.forEach((key, index) => {
		if (index === keys.length - 1) nestedForm[key] = value;
		else {
			if (!nestedForm[key] || typeof nestedForm[key] !== "object" || Array.isArray(nestedForm[key]) || nestedForm[key] instanceof File) {
				if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
				nestedForm[key] = Object.create(null);
			}
			nestedForm = nestedForm[key];
		}
	});
};
var throwNestingLimitExceeded = () => {
	throw new Error("Nesting limit exceeded");
};
// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
	const paths = path.split("/");
	if (paths[0] === "") paths.shift();
	return paths;
};
var splitRoutingPath = (routePath) => {
	const { groups, path } = extractGroupsFromPath(routePath);
	return replaceGroupMarks(splitPath(path), groups);
};
var extractGroupsFromPath = (path) => {
	const groups = [];
	path = path.replace(/\{[^}]+\}/g, (match, index) => {
		const mark = `@${index}`;
		groups.push([mark, match]);
		return mark;
	});
	return {
		groups,
		path
	};
};
var replaceGroupMarks = (paths, groups) => {
	for (let i = groups.length - 1; i >= 0; i--) {
		const [mark] = groups[i];
		for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
			paths[j] = paths[j].replace(mark, groups[i][1]);
			break;
		}
	}
	return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
	if (label === "*") return "*";
	const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
	if (match) {
		const cacheKey = `${label}#${next}`;
		if (!patternCache[cacheKey]) {
			if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
				cacheKey,
				match[1],
				new RegExp(`^${match[2]}(?=/${next})`)
			] : [
				label,
				match[1],
				new RegExp(`^${match[2]}$`)
			];
			else patternCache[cacheKey] = [
				label,
				match[1],
				true
			];
		}
		return patternCache[cacheKey];
	}
	return null;
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
/**
* Try to apply decodeURI() to given string.
* If it fails, skip invalid percent encoding or invalid UTF-8 sequences, and apply decodeURI() to the rest as much as possible.
* @param str The string to decode.
* @returns The decoded string that sometimes contains undecodable percent encoding.
* @example
* tryDecodeURI('Hello%20World') // 'Hello World'
* tryDecodeURI('Hello%20World/%A4%A2') // 'Hello World/%A4%A2'
*/
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf(":") + 4);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const hashIndex = url.indexOf("#", i);
			const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
			const path = url.slice(start, end);
			return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
		} else if (charCode === 63 || charCode === 35) break;
	}
	return url.slice(start, i);
};
var getPathNoStrict = (request) => {
	const result = getPath(request);
	return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
/**
* Merge paths.
* @param {string[]} ...paths - The paths to merge.
* @returns {string} The merged path.
* @example
* mergePath('/api', '/users') // '/api/users'
* mergePath('/api/', '/users') // '/api/users'
* mergePath('/api', '/') // '/api'
* mergePath('/api/', '/') // '/api/'
*/
var mergePath = (base, sub, ...rest) => {
	if (rest.length) sub = mergePath(sub, ...rest);
	return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
	if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
	const segments = path.split("/");
	const results = [];
	let basePath = "";
	segments.forEach((segment) => {
		if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
		else if (/\:/.test(segment)) {
			if (segment.charCodeAt(segment.length - 1) === 63) {
				if (results.length === 0 && basePath === "") results.push("/");
				else results.push(basePath);
				const optionalSegment = segment.slice(0, -1);
				basePath += "/" + optionalSegment;
				results.push(basePath);
			} else basePath += "/" + segment;
		}
	});
	return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
	const hashIndex = url.indexOf("#", 8);
	if (hashIndex !== -1) url = url.slice(0, hashIndex);
	let encoded;
	if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
		let keyIndex = url.indexOf("?", 8);
		if (keyIndex === -1) return;
		if (!url.startsWith(key, keyIndex + 1)) keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		while (keyIndex !== -1) {
			const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
			if (trailingKeyCode === 61) {
				const valueIndex = keyIndex + key.length + 2;
				const endIndex = url.indexOf("&", valueIndex);
				return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
			} else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
			keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		}
		encoded = /[%+]/.test(url);
		if (!encoded) return;
	}
	const results = Object.create(null);
	encoded ??= /[%+]/.test(url);
	let keyIndex = url.indexOf("?", 8);
	while (keyIndex !== -1) {
		const nextKeyIndex = url.indexOf("&", keyIndex + 1);
		let valueIndex = url.indexOf("=", keyIndex);
		if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
		let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
		if (encoded) name = _decodeURI(name);
		keyIndex = nextKeyIndex;
		if (name === "") continue;
		let value;
		if (valueIndex === -1) value = "";
		else {
			value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
			if (encoded) value = _decodeURI(value);
		}
		if (multiple) {
			if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
			results[name].push(value);
		} else results[name] ??= value;
	}
	return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
	return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;
// node_modules/hono/dist/request.js
var HonoRequest = class {
	/**
	* `.raw` can get the raw Request object.
	*
	* @see {@link https://hono.dev/docs/api/request#raw}
	*
	* @example
	* ```ts
	* // For Cloudflare Workers
	* app.post('/', async (c) => {
	*   const metadata = c.req.raw.cf?.hostMetadata?
	*   ...
	* })
	* ```
	*/
	raw;
	#validatedData;
	#matchResult;
	routeIndex = 0;
	/**
	* `.path` can get the pathname of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#path}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const pathname = c.req.path // `/about/me`
	* })
	* ```
	*/
	path;
	bodyCache = {};
	constructor(request, path = "/", matchResult = [[]]) {
		this.raw = request;
		this.path = path;
		this.#matchResult = matchResult;
	}
	param(key) {
		return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
	}
	#getDecodedParam(key) {
		const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
		const param = this.#getParamValue(paramKey);
		return param && tryDecodeURIComponent(param);
	}
	#getAllDecodedParams() {
		const decoded = {};
		const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
		for (const key of keys) {
			const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
			if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
		}
		return decoded;
	}
	#getParamValue(paramKey) {
		return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
	}
	query(key) {
		return getQueryParam(this.url, key);
	}
	queries(key) {
		return getQueryParams(this.url, key);
	}
	header(name) {
		if (name) return this.raw.headers.get(name) ?? void 0;
		const headerData = Object.create(null);
		this.raw.headers.forEach((value, key) => {
			headerData[key] = value;
		});
		return headerData;
	}
	async parseBody(options) {
		return parseBody(this, options);
	}
	#cachedBody = (key) => {
		const { bodyCache, raw } = this;
		const cachedBody = bodyCache[key];
		if (cachedBody) return cachedBody;
		for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
			if (anyCachedKey === "json") body = JSON.stringify(body);
			const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
			return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
		});
		return bodyCache[key] = raw[key]();
	};
	/**
	* `.json()` can parse Request body of type `application/json`
	*
	* @see {@link https://hono.dev/docs/api/request#json}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.json()
	* })
	* ```
	*/
	json() {
		return this.#cachedBody("text").then((text) => JSON.parse(text));
	}
	/**
	* `.text()` can parse Request body of type `text/plain`
	*
	* @see {@link https://hono.dev/docs/api/request#text}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.text()
	* })
	* ```
	*/
	text() {
		return this.#cachedBody("text");
	}
	/**
	* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
	*
	* @see {@link https://hono.dev/docs/api/request#arraybuffer}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.arrayBuffer()
	* })
	* ```
	*/
	arrayBuffer() {
		return this.#cachedBody("arrayBuffer");
	}
	/**
	* `.bytes()` parses the request body as a `Uint8Array`.
	*
	* @see {@link https://hono.dev/docs/api/request#bytes}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.bytes()
	* })
	* ```
	*/
	bytes() {
		return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
	}
	/**
	* Parses the request body as a `Blob`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.blob();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#blob
	*/
	blob() {
		return this.#cachedBody("blob");
	}
	/**
	* Parses the request body as `FormData`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.formData();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#formdata
	*/
	formData() {
		return this.#cachedBody("formData");
	}
	/**
	* Adds validated data to the request.
	*
	* @param target - The target of the validation.
	* @param data - The validated data to add.
	*/
	addValidatedData(target, data) {
		(this.#validatedData ??= {})[target] = data;
	}
	valid(target) {
		return this.#validatedData?.[target];
	}
	/**
	* `.url` can get the request url strings.
	*
	* @see {@link https://hono.dev/docs/api/request#url}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const url = c.req.url // `http://localhost:8787/about/me`
	*   ...
	* })
	* ```
	*/
	get url() {
		return this.raw.url;
	}
	/**
	* `.method` can get the method name of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#method}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const method = c.req.method // `GET`
	* })
	* ```
	*/
	get method() {
		return this.raw.method;
	}
	get [GET_MATCH_RESULT]() {
		return this.#matchResult;
	}
	/**
	* `.matchedRoutes` can return a matched route in the handler
	*
	* @deprecated
	*
	* Use matchedRoutes helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#matchedroutes}
	*
	* @example
	* ```ts
	* app.use('*', async function logger(c, next) {
	*   await next()
	*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
	*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
	*     console.log(
	*       method,
	*       ' ',
	*       path,
	*       ' '.repeat(Math.max(10 - path.length, 0)),
	*       name,
	*       i === c.req.routeIndex ? '<- respond from here' : ''
	*     )
	*   })
	* })
	* ```
	*/
	get matchedRoutes() {
		return this.#matchResult[0].map(([[, route]]) => route);
	}
	/**
	* `.routePath` can retrieve the path registered within the handler
	*
	* @deprecated
	*
	* Use routePath helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#routepath}
	*
	* @example
	* ```ts
	* app.get('/posts/:id', (c) => {
	*   return c.json({ path: c.req.routePath })
	* })
	* ```
	*/
	get routePath() {
		return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
	}
};
// node_modules/hono/dist/utils/html.js
/**
* @module
* HTML utility.
*/
var HtmlEscapedCallbackPhase = {
	Stringify: 1,
	BeforeStream: 2,
	Stream: 3
};
var raw = (value, callbacks) => {
	const escapedString = new String(value);
	escapedString.isEscaped = true;
	escapedString.callbacks = callbacks;
	return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
	if (typeof str === "object" && !(str instanceof String)) {
		if (!(str instanceof Promise)) str = str.toString();
		if (str instanceof Promise) str = await str;
	}
	const callbacks = str.callbacks;
	if (!callbacks?.length) return Promise.resolve(str);
	if (buffer) buffer[0] += str;
	else buffer = [str];
	const resStr = Promise.all(callbacks.map((c) => c({
		phase,
		buffer,
		context
	}))).then((res) => Promise.all(res.filter(Boolean).map((str) => resolveCallback(str, phase, false, context, buffer))).then(() => buffer[0]));
	if (preserveCallbacks) return raw(await resStr, callbacks);
	else return resStr;
};
// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
	return {
		"Content-Type": contentType,
		...headers
	};
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
	#rawRequest;
	#req;
	/**
	* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
	*
	* @see {@link https://hono.dev/docs/api/context#env}
	*
	* @example
	* ```ts
	* // Environment object for Cloudflare Workers
	* app.get('*', async c => {
	*   const counter = c.env.COUNTER
	* })
	* ```
	*/
	env = {};
	#var;
	finalized = false;
	/**
	* `.error` can get the error object from the middleware if the Handler throws an error.
	*
	* @see {@link https://hono.dev/docs/api/context#error}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   await next()
	*   if (c.error) {
	*     // do something...
	*   }
	* })
	* ```
	*/
	error;
	#status;
	#executionCtx;
	#res;
	#layout;
	#renderer;
	#notFoundHandler;
	#preparedHeaders;
	#matchResult;
	#path;
	/**
	* Creates an instance of the Context class.
	*
	* @param req - The Request object.
	* @param options - Optional configuration options for the context.
	*/
	constructor(req, options) {
		this.#rawRequest = req;
		if (options) {
			this.#executionCtx = options.executionCtx;
			this.env = options.env;
			this.#notFoundHandler = options.notFoundHandler;
			this.#path = options.path;
			this.#matchResult = options.matchResult;
		}
	}
	/**
	* `.req` is the instance of {@link HonoRequest}.
	*/
	get req() {
		this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
		return this.#req;
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#event}
	* The FetchEvent associated with the current request.
	*
	* @throws Will throw an error if the context does not have a FetchEvent.
	*/
	get event() {
		if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no FetchEvent");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#executionctx}
	* The ExecutionContext associated with the current request.
	*
	* @throws Will throw an error if the context does not have an ExecutionContext.
	*/
	get executionCtx() {
		if (this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no ExecutionContext");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#res}
	* The Response object for the current request.
	*/
	get res() {
		return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
	}
	/**
	* Sets the Response object for the current request.
	*
	* @param _res - The Response object to set.
	*/
	set res(_res) {
		if (this.#res && _res) {
			_res = createResponseInstance(_res.body, _res);
			for (const [k, v] of this.#res.headers.entries()) {
				if (k === "content-type") continue;
				if (k === "set-cookie") {
					const cookies = this.#res.headers.getSetCookie();
					_res.headers.delete("set-cookie");
					for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
				} else _res.headers.set(k, v);
			}
		}
		this.#res = _res;
		this.finalized = true;
	}
	/**
	* `.render()` can create a response within a layout.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   return c.render('Hello!')
	* })
	* ```
	*/
	render = (...args) => {
		this.#renderer ??= (content) => this.html(content);
		return this.#renderer(...args);
	};
	/**
	* Sets the layout for the response.
	*
	* @param layout - The layout to set.
	* @returns The layout function.
	*/
	setLayout = (layout) => this.#layout = layout;
	/**
	* Gets the current layout for the response.
	*
	* @returns The current layout function.
	*/
	getLayout = () => this.#layout;
	/**
	* `.setRenderer()` can set the layout in the custom middleware.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```tsx
	* app.use('*', async (c, next) => {
	*   c.setRenderer((content) => {
	*     return c.html(
	*       <html>
	*         <body>
	*           <p>{content}</p>
	*         </body>
	*       </html>
	*     )
	*   })
	*   await next()
	* })
	* ```
	*/
	setRenderer = (renderer) => {
		this.#renderer = renderer;
	};
	/**
	* `.header()` can set headers.
	*
	* @see {@link https://hono.dev/docs/api/context#header}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*
	*   // Append multiple headers using the append option (e.g. Vary)
	*   c.header('Vary', 'Accept-Encoding', { append: true })
	*   c.header('Vary', 'User-Agent', { append: true })
	*
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	header = (name, value, options) => {
		if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
		const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
		if (value === void 0) headers.delete(name);
		else if (options?.append) headers.append(name, value);
		else headers.set(name, value);
	};
	status = (status) => {
		this.#status = status;
	};
	/**
	* `.set()` can set the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   c.set('message', 'Hono is hot!!')
	*   await next()
	* })
	* ```
	*/
	set = (key, value) => {
		this.#var ??= /* @__PURE__ */ new Map();
		this.#var.set(key, value);
	};
	/**
	* `.get()` can use the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   const message = c.get('message')
	*   return c.text(`The message is "${message}"`)
	* })
	* ```
	*/
	get = (key) => {
		return this.#var ? this.#var.get(key) : void 0;
	};
	/**
	* `.var` can access the value of a variable.
	*
	* @see {@link https://hono.dev/docs/api/context#var}
	*
	* @example
	* ```ts
	* const result = c.var.client.oneMethod()
	* ```
	*/
	get var() {
		if (!this.#var) return {};
		return Object.fromEntries(this.#var);
	}
	#newResponse(data, arg, headers) {
		let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
		if (typeof arg === "object" && arg.headers) {
			responseHeaders ??= new Headers();
			for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
			else responseHeaders.set(key, value);
		}
		if (headers) {
			if (!responseHeaders) {
				let count = 0;
				for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
					responseHeaders = new Headers();
					break;
				}
			}
			if (responseHeaders) for (const k in headers) {
				const v = headers[k];
				if (typeof v === "string") responseHeaders.set(k, v);
				else {
					responseHeaders.delete(k);
					for (const v2 of v) responseHeaders.append(k, v2);
				}
			}
		}
		return createResponseInstance(data, {
			status: typeof arg === "number" ? arg : arg?.status ?? this.#status,
			headers: responseHeaders ?? headers
		});
	}
	newResponse = (...args) => this.#newResponse(...args);
	/**
	* `.body()` can return the HTTP response.
	* You can set headers with `.header()` and set HTTP status code with `.status`.
	* This can also be set in `.text()`, `.json()` and so on.
	*
	* @see {@link https://hono.dev/docs/api/context#body}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*   // Set HTTP status code
	*   c.status(201)
	*
	*   // Return the response body
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	body = (data, arg, headers) => this.#newResponse(data, arg, headers);
	/**
	* `.text()` can render text as `Content-Type:text/plain`.
	*
	* @see {@link https://hono.dev/docs/api/context#text}
	*
	* @example
	* ```ts
	* app.get('/say', (c) => {
	*   return c.text('Hello!')
	* })
	* ```
	*/
	text = (text, arg, headers) => {
		return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
	};
	/**
	* `.json()` can render JSON as `Content-Type:application/json`.
	*
	* @see {@link https://hono.dev/docs/api/context#json}
	*
	* @example
	* ```ts
	* app.get('/api', (c) => {
	*   return c.json({ message: 'Hello!' })
	* })
	* ```
	*/
	json = (object, arg, headers) => {
		return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
	};
	html = (html, arg, headers) => {
		const res = (html) => this.#newResponse(html, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
		return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
	};
	/**
	* `.redirect()` can Redirect, default status code is 302.
	*
	* @see {@link https://hono.dev/docs/api/context#redirect}
	*
	* @example
	* ```ts
	* app.get('/redirect', (c) => {
	*   return c.redirect('/')
	* })
	* app.get('/redirect-permanently', (c) => {
	*   return c.redirect('/', 301)
	* })
	* ```
	*/
	redirect = (location, status) => {
		const locationString = String(location);
		this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
		return this.newResponse(null, status ?? 302);
	};
	/**
	* `.notFound()` can return the Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/context#notfound}
	*
	* @example
	* ```ts
	* app.get('/notfound', (c) => {
	*   return c.notFound()
	* })
	* ```
	*/
	notFound = () => {
		this.#notFoundHandler ??= () => createResponseInstance();
		return this.#notFoundHandler(this);
	};
};
// node_modules/hono/dist/compose.js
/**
* Compose middleware functions into a single function based on `koa-compose` package.
*
* @template E - The environment type.
*
* @param {[[Function, unknown], unknown][] | [[Function]][]} middleware - An array of middleware functions and their corresponding parameters.
* @param {ErrorHandler<E>} [onError] - An optional error handler function.
* @param {NotFoundHandler<E>} [onNotFound] - An optional not-found handler function.
*
* @returns {(context: Context, next?: Next) => Promise<Context>} - A composed middleware function.
*/
var compose = (middleware, onError, onNotFound) => {
	return (context, next) => {
		let index = -1;
		return dispatch(0);
		/**
		* Dispatch the middleware functions.
		*
		* @param {number} i - The current index in the middleware array.
		*
		* @returns {Promise<Context>} - A promise that resolves to the context.
		*/
		async function dispatch(i) {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;
			let res;
			let isError = false;
			let handler;
			if (middleware[i]) {
				handler = middleware[i][0][0];
				context.req.routeIndex = i;
			} else handler = i === middleware.length && next || void 0;
			if (handler) try {
				res = await handler(context, () => dispatch(i + 1));
			} catch (err) {
				if (err instanceof Error && onError) {
					context.error = err;
					res = await onError(err, context);
					isError = true;
				} else throw err;
			}
			else if (context.finalized === false && onNotFound) res = await onNotFound(context);
			if (res && (context.finalized === false || isError)) context.res = res;
			return context;
		}
	};
};
// node_modules/hono/dist/router.js
/**
* Array of supported HTTP methods.
*/
var METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"options",
	"patch",
	"query"
];
/**
* Error message indicating that a route cannot be added because the matcher is already built.
*/
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
/**
* Error class representing an unsupported path error.
*/
var UnsupportedPathError = class extends Error {};
// node_modules/hono/dist/utils/constants.js
/**
* Constant used to mark a composed handler.
*/
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
// node_modules/hono/dist/hono-base.js
/**
* @module
* This module is the base module for the Hono object.
*/
var notFoundHandler = (c) => {
	return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
	if ("getResponse" in err) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};
var Hono$1 = class Hono {
	get;
	post;
	put;
	delete;
	options;
	patch;
	query;
	all;
	on;
	use;
	router;
	getPath;
	_basePath = "/";
	#path = "/";
	routes = [];
	constructor(options = {}) {
		[...METHODS, "all"].forEach((method) => {
			this[method] = (args1, ...args) => {
				const methodName = method.toUpperCase();
				if (typeof args1 === "string") this.#path = args1;
				else this.#addRoute(methodName, this.#path, args1);
				args.forEach((handler) => {
					this.#addRoute(methodName, this.#path, handler);
				});
				return this;
			};
		});
		this.on = (method, path, ...handlers) => {
			for (const p of [path].flat()) {
				this.#path = p;
				for (const m of [method].flat()) {
					const methodName = m.toUpperCase();
					for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
				}
			}
			return this;
		};
		this.use = (arg1, ...handlers) => {
			if (typeof arg1 === "string") this.#path = arg1;
			else {
				this.#path = "*";
				handlers.unshift(arg1);
			}
			handlers.forEach((handler) => {
				this.#addRoute("ALL", this.#path, handler);
			});
			return this;
		};
		const { strict, ...optionsWithoutStrict } = options;
		Object.assign(this, optionsWithoutStrict);
		this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
	}
	#clone() {
		const clone = new Hono({
			router: this.router,
			getPath: this.getPath
		});
		clone.errorHandler = this.errorHandler;
		clone.#notFoundHandler = this.#notFoundHandler;
		clone.routes = this.routes;
		return clone;
	}
	#notFoundHandler = notFoundHandler;
	errorHandler = errorHandler;
	/**
	* `.route()` allows grouping other Hono instance in routes.
	*
	* @see {@link https://hono.dev/docs/api/routing#grouping}
	*
	* @param {string} path - base Path
	* @param {Hono} app - other Hono instance
	* @returns {Hono} routed Hono instance
	*
	* @example
	* ```ts
	* const app = new Hono()
	* const app2 = new Hono()
	*
	* app2.get("/user", (c) => c.text("user"))
	* app.route("/api", app2) // GET /api/user
	* ```
	*/
	route(path, app) {
		const subApp = this.basePath(path);
		app.routes.map((r) => {
			let handler;
			if (app.errorHandler === errorHandler) handler = r.handler;
			else {
				handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
				handler[COMPOSED_HANDLER] = r.handler;
			}
			subApp.#addRoute(r.method, r.path, handler, r.basePath);
		});
		return this;
	}
	/**
	* `.basePath()` allows base paths to be specified.
	*
	* @see {@link https://hono.dev/docs/api/routing#base-path}
	*
	* @param {string} path - base Path
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* const api = new Hono().basePath('/api')
	* ```
	*/
	basePath(path) {
		const subApp = this.#clone();
		subApp._basePath = mergePath(this._basePath, path);
		return subApp;
	}
	/**
	* `.onError()` handles an error and returns a customized Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#error-handling}
	*
	* @param {ErrorHandler} handler - request Handler for error
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.onError((err, c) => {
	*   console.error(`${err}`)
	*   return c.text('Custom Error Message', 500)
	* })
	* ```
	*/
	onError = (handler) => {
		this.errorHandler = handler;
		return this;
	};
	/**
	* `.notFound()` allows you to customize a Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#not-found}
	*
	* @param {NotFoundHandler} handler - request handler for not-found
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.notFound((c) => {
	*   return c.text('Custom 404 Message', 404)
	* })
	* ```
	*/
	notFound = (handler) => {
		this.#notFoundHandler = handler;
		return this;
	};
	/**
	* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
	*
	* @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
	*
	* @see {@link https://hono.dev/docs/api/hono#mount}
	*
	* @param {string} path - base Path
	* @param {Function} applicationHandler - other Request Handler
	* @param {MountOptions} [options] - options of `.mount()`
	* @returns {Hono} mounted Hono instance
	*
	* @example
	* ```ts
	* import { Router as IttyRouter } from 'itty-router'
	* import { Hono } from 'hono'
	* // Create itty-router application
	* const ittyRouter = IttyRouter()
	* // GET /itty-router/hello
	* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
	*
	* const app = new Hono()
	* app.mount('/itty-router', ittyRouter.handle)
	* ```
	*
	* @example
	* ```ts
	* const app = new Hono()
	* // Send the request to another application without modification.
	* app.mount('/app', anotherApp, {
	*   replaceRequest: (req) => req,
	* })
	* ```
	*/
	mount(path, applicationHandler, options) {
		let replaceRequest;
		let optionHandler;
		if (options) {
			if (typeof options === "function") optionHandler = options;
			else {
				optionHandler = options.optionHandler;
				if (options.replaceRequest === false) replaceRequest = (request) => request;
				else replaceRequest = options.replaceRequest;
			}
		}
		const getOptions = optionHandler ? (c) => {
			const options = optionHandler(c);
			return Array.isArray(options) ? options : [options];
		} : (c) => {
			let executionContext = void 0;
			try {
				executionContext = c.executionCtx;
			} catch {}
			return [c.env, executionContext];
		};
		replaceRequest ||= (() => {
			const mergedPath = mergePath(this._basePath, path);
			const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
			return (request) => {
				const url = new URL(request.url);
				url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
				return new Request(url, request);
			};
		})();
		const handler = async (c, next) => {
			const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
			if (res) return res;
			await next();
		};
		this.#addRoute("ALL", mergePath(path, "*"), handler);
		return this;
	}
	#addRoute(method, path, handler, baseRoutePath) {
		path = mergePath(this._basePath, path);
		const r = {
			basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
			path,
			method,
			handler
		};
		this.router.add(method, path, [handler, r]);
		this.routes.push(r);
	}
	#handleError(err, c) {
		if (err instanceof Error) return this.errorHandler(err, c);
		throw err;
	}
	#dispatch(request, executionCtx, env, method) {
		if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
		const path = this.getPath(request, { env });
		const matchResult = this.router.match(method, path);
		const c = new Context(request, {
			path,
			matchResult,
			env,
			executionCtx,
			notFoundHandler: this.#notFoundHandler
		});
		if (matchResult[0].length === 1) {
			let res;
			try {
				res = matchResult[0][0][0][0](c, async () => {
					c.res = await this.#notFoundHandler(c);
				});
			} catch (err) {
				return this.#handleError(err, c);
			}
			return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
		}
		const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
		return (async () => {
			try {
				const context = await composed(c);
				if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
				return context.res;
			} catch (err) {
				return this.#handleError(err, c);
			}
		})();
	}
	/**
	* `.fetch()` will be entry point of your app.
	*
	* @see {@link https://hono.dev/docs/api/hono#fetch}
	*
	* @param {Request} request - request Object of request
	* @param {Env} env - env Object
	* @param {ExecutionContext} executionCtx - context of execution
	* @returns {Response | Promise<Response>} response of request
	*
	*/
	fetch = (request, ...rest) => {
		return this.#dispatch(request, rest[1], rest[0], request.method);
	};
	/**
	* `.request()` is a useful method for testing.
	* You can pass a URL or pathname to send a GET request.
	* app will return a Response object.
	* ```ts
	* test('GET /hello is ok', async () => {
	*   const res = await app.request('/hello')
	*   expect(res.status).toBe(200)
	* })
	* ```
	* @see https://hono.dev/docs/api/hono#request
	*/
	request = (input, requestInit, Env, executionCtx) => {
		if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
		input = input.toString();
		return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
	};
	/**
	* `.fire()` automatically adds a global fetch event listener.
	* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
	* @deprecated
	* Use `fire` from `hono/service-worker` instead.
	* ```ts
	* import { Hono } from 'hono'
	* import { fire } from 'hono/service-worker'
	*
	* const app = new Hono()
	* // ...
	* fire(app)
	* ```
	* @see https://hono.dev/docs/api/hono#fire
	* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
	* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
	*/
	fire = () => {
		addEventListener("fetch", (event) => {
			event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
		});
	};
};
// node_modules/hono/dist/router/utils.js
var createNullObject = () => Object.create(null);
// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match = ((method, path) => {
		const matcher = matchers[method] || matchers["ALL"];
		const staticMatch = matcher[2][path];
		if (staticMatch) return staticMatch;
		const match = path.match(matcher[0]);
		if (!match) return [[], emptyParam];
		const index = match.indexOf("", 1);
		return [matcher[1][index], match];
	});
	this.match = match;
	return match(method, path);
}
// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
/**
* Sort order:
* 1. literal
* 2. special pattern (e.g. :label{[0-9]+})
* 3. common label pattern (e.g. :label)
* 4. wildcard
*/
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
	else if (b === ".*" || b === "(?:|/.*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node$1 = class Node {
	#index;
	#varIndex;
	#children = createNullObject();
	insert(tokens, index, paramMap, context, isStatic) {
		let node = this;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
				"",
				"",
				".*"
			] : [
				"",
				"",
				LABEL_REG_EXP_STR
			] : null : token === "/*" ? [
				"",
				"",
				TAIL_WILDCARD_REG_EXP_STR
			] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
			let nextNode;
			if (pattern) {
				const name = pattern[1];
				let regexpStr = pattern[2] || "[^/]+";
				if (name && pattern[2]) {
					if (regexpStr === ".*") throw PATH_ERROR;
					regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
					if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
					if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
				}
				nextNode = node.#children[regexpStr];
				if (!nextNode) {
					if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
						for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr] = new Node();
				}
				if (name !== "") {
					nextNode.#varIndex ??= context.varIndex++;
					paramMap.push([name, nextNode.#varIndex]);
				}
			} else {
				nextNode = node.#children[token];
				if (!nextNode) {
					for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
					nextNode = node.#children[token] = new Node();
				}
			}
			node = nextNode;
		}
		if (node.#index !== void 0) throw PATH_ERROR;
		node.#index = isStatic ? -1 : index;
	}
	buildRegExpStr() {
		const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
			const c = this.#children[k];
			const childStr = c.buildRegExpStr();
			return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
		}).filter(Boolean);
		if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
		if (strList.length === 0) return "";
		if (strList.length === 1) return strList[0];
		return "(?:" + strList.join("|") + ")";
	}
};
// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
	#context = { varIndex: 0 };
	#root = new Node$1();
	#index = 0;
	paths = createNullObject();
	insert(path, isStatic) {
		if (isStatic) {
			this.#root.insert(path.split(""), 0, [], this.#context, true);
			return;
		}
		const paramAssoc = [];
		const groups = [];
		let markedPath = path;
		for (let i = 0;;) {
			let replaced = false;
			markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
				const mark = `@\\${i}`;
				groups[i] = [mark, m];
				i++;
				replaced = true;
				return mark;
			});
			if (!replaced) break;
		}
		/**
		*  - pattern (:label, :label{0-9]+}, ...)
		*  - /* wildcard
		*  - character
		*/
		const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
				tokens[j] = tokens[j].replace(mark, groups[i][1]);
				break;
			}
		}
		this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
		this.paths[path] = [this.#index++, paramAssoc];
	}
	buildRegExp() {
		let regexp = this.#root.buildRegExpStr();
		if (regexp === "") return [
			/^$/,
			[],
			[]
		];
		let captureIndex = 0;
		const indexReplacementMap = [];
		const paramReplacementMap = [];
		regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
			if (handlerIndex !== void 0) {
				indexReplacementMap[++captureIndex] = Number(handlerIndex);
				return "$()";
			}
			if (paramIndex !== void 0) {
				paramReplacementMap[Number(paramIndex)] = ++captureIndex;
				return "";
			}
			return "";
		});
		return [
			new RegExp(`^${regexp}`),
			indexReplacementMap,
			paramReplacementMap
		];
	}
};
// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
	return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match, metaChar) => metaChar ? `\\${metaChar}` : match === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
	for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var RegExpRouter = class {
	name = "RegExpRouter";
	#middleware;
	#routes;
	#tries;
	constructor() {
		this.#middleware = { ["ALL"]: createNullObject() };
		this.#routes = { ["ALL"]: createNullObject() };
		this.#tries = { ["ALL"]: new Trie() };
	}
	#insertPath(method, path) {
		try {
			this.#tries[method].insert(path, !/\*|\/:/.test(path));
		} catch (e) {
			throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
		}
	}
	add(method, path, handler) {
		const middleware = this.#middleware;
		const routes = this.#routes;
		if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		if (!middleware[method]) {
			this.#tries[method] = new Trie();
			for (const handlerMap of [middleware, routes]) {
				handlerMap[method] = createNullObject();
				for (const p in handlerMap["ALL"]) {
					handlerMap[method][p] = [...handlerMap["ALL"][p]];
					this.#insertPath(method, p);
				}
			}
		}
		if (path === "/*") path = "*";
		const methods = method === "ALL" ? Object.keys(middleware) : [method];
		if (/\*$/.test(path)) {
			const re = buildWildcardRegExp(path);
			for (const m of methods) if (!middleware[m][path]) {
				this.#insertPath(m, path);
				middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
			}
			for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
			return;
		}
		const paths = checkOptionalParameter(path) || [path];
		for (const path of paths) for (const m of methods) {
			if (!routes[m][path]) {
				this.#insertPath(m, path);
				routes[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
			}
			routes[m][path].push([handler, path]);
		}
	}
	match = match;
	buildAllMatchers() {
		const matchers = createNullObject();
		for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
		this.#middleware = this.#routes = this.#tries = void 0;
		wildcardRegExpCache = createNullObject();
		return matchers;
	}
	#buildMatcher(method) {
		const middleware = this.#middleware[method];
		const routes = this.#routes[method];
		const trie = this.#tries[method];
		const staticMap = createNullObject();
		const handlerData = [];
		const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
		for (const r of [middleware, routes]) for (const path in r) {
			const handlers = r[path];
			const pathData = trie.paths[path];
			if (!pathData) {
				staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
				continue;
			}
			handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
				map[key] = paramReplacementMap[pathData[1][i][1]];
				return map;
			}, createNullObject())]);
		}
		return [
			regexp,
			indexReplacementMap.map((i) => handlerData[i]),
			staticMap
		];
	}
};
// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
	name = "SmartRouter";
	#routers = [];
	#routes = [];
	constructor(init) {
		this.#routers = init.routers;
	}
	add(method, path, handler) {
		if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		this.#routes.push([
			method,
			path,
			handler
		]);
	}
	match(method, path) {
		if (!this.#routes) throw new Error("Fatal error");
		const routers = this.#routers;
		const routes = this.#routes;
		const len = routers.length;
		let i = 0;
		let res;
		for (; i < len; i++) {
			const router = routers[i];
			try {
				for (let i = 0, len = routes.length; i < len; i++) router.add(...routes[i]);
				res = router.match(method, path);
			} catch (e) {
				if (e instanceof UnsupportedPathError) continue;
				throw e;
			}
			this.match = router.match.bind(router);
			this.#routers = [router];
			this.#routes = void 0;
			break;
		}
		if (i === len) throw new Error("Fatal error");
		this.name = `SmartRouter + ${this.activeRouter.name}`;
		return res;
	}
	get activeRouter() {
		if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
		return this.#routers[0];
	}
};
// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node = class Node {
	#methods = [];
	#children = createNullObject();
	#patterns = [];
	#pattern;
	#params = emptyParams;
	insert(method, path, handler) {
		let curNode = this;
		const parts = splitRoutingPath(path);
		const possibleKeys = /* @__PURE__ */ new Set();
		let i = 0;
		for (const p of parts) {
			const nextP = parts[++i];
			const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
			const isParam = Array.isArray(pattern);
			const key = isParam ? pattern[0] : pattern || p;
			const child = curNode.#children[key] ||= new Node();
			if (pattern && !child.#pattern) {
				child.#pattern = pattern;
				curNode.#patterns.push(child);
			}
			curNode = child;
			if (isParam) possibleKeys.add(pattern[1]);
		}
		curNode.#methods.push({ [method]: {
			handler,
			possibleKeys: [...possibleKeys],
			score: ++order
		} });
	}
	#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
		for (let i = 0, len = node.#methods.length; i < len; i++) {
			const m = node.#methods[i];
			const handlerSet = m[method] || m["ALL"];
			if (handlerSet) {
				handlerSet.params = createNullObject();
				handlerSets.push(handlerSet);
				for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
					const key = handlerSet.possibleKeys[i];
					handlerSet.params[key] = params?.[key] && !i ? params[key] : nodeParams[key] ?? params?.[key];
				}
			}
		}
	}
	search(method, path) {
		const handlerSets = [];
		this.#params = emptyParams;
		let curNodes = [this];
		const parts = splitPath(path);
		const curNodesQueue = [];
		const len = parts.length;
		let partOffsets = null;
		for (let i = 0; i < len; i++) {
			const part = parts[i];
			const isLast = i === len - 1;
			const tempNodes = [];
			for (let j = 0, len2 = curNodes.length; j < len2; j++) {
				const node = curNodes[j];
				const nextNode = node.#children[part];
				if (nextNode) {
					nextNode.#params = node.#params;
					if (isLast) {
						if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
						this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
					} else tempNodes.push(nextNode);
				}
				for (const child of node.#patterns) {
					const pattern = child.#pattern;
					const params = node.#params === emptyParams ? {} : { ...node.#params };
					if (typeof pattern === "string") {
						if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
							this.#pushHandlerSets(handlerSets, child, method, node.#params);
							if (pattern === "*") {
								child.#params = params;
								tempNodes.push(child);
							}
						}
						continue;
					}
					const [, name, matcher] = pattern;
					if (!part && matcher === true) continue;
					if (matcher !== true) {
						if (!partOffsets) {
							partOffsets = [];
							let offset = path[0] === "/" ? 1 : 0;
							for (let p = 0; p < len; p++) {
								partOffsets[p] = offset;
								offset += parts[p].length + 1;
							}
						}
						const restPathString = path.slice(partOffsets[i]);
						const m = matcher.exec(restPathString);
						if (m) {
							params[name] = m[0];
							this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
							if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
							for (const _ in child.#children) {
								child.#params = params;
								const componentCount = m[0].match(/\//g)?.length ?? 0;
								(curNodesQueue[componentCount] ||= []).push(child);
								break;
							}
							continue;
						}
					}
					if (matcher === true || matcher.test(part)) {
						params[name] = part;
						if (isLast) {
							this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
							if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
						} else {
							child.#params = params;
							tempNodes.push(child);
						}
					}
				}
			}
			const shifted = curNodesQueue.shift();
			curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
		}
		if (handlerSets[1]) handlerSets.sort((a, b) => {
			return a.score - b.score;
		});
		return [handlerSets.map(({ handler, params }) => [handler, params])];
	}
};
// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
	name = "TrieRouter";
	#node = new Node();
	add(method, path, handler) {
		for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
	}
	match(method, path) {
		return this.#node.search(method, path);
	}
};
// node_modules/hono/dist/hono.js
/**
* The Hono class extends the functionality of the HonoBase class.
* It sets up routing and allows for custom options to be passed.
*
* @template E - The environment type.
* @template S - The schema type.
* @template BasePath - The base path type.
*/
var Hono = class extends Hono$1 {
	/**
	* Creates an instance of the Hono class.
	*
	* @param options - Optional configuration options for the Hono instance.
	*/
	constructor(options = {}) {
		super(options);
		this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
	}
};
// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: !0 });
function concat(...buffers) {
	const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
	let i = 0;
	for (const buffer of buffers) buf.set(buffer, i), i += buffer.length;
	return buf;
}
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
	if (typeof string == "string" && string.length >= 128) {
		if (NON_ASCII.test(string)) throw new TypeError("non-ASCII string encountered in encode()");
		return encoder.encode(string);
	}
	const bytes = new Uint8Array(string.length);
	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if (code > 127) throw new TypeError("non-ASCII string encountered in encode()");
		bytes[i] = code;
	}
	return bytes;
}
function decodeBase64(encoded, url = !1) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
	if (url) {
		if (encoded.includes("+") || encoded.includes("/")) throw new TypeError("Invalid base64url");
		encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
	}
	const binary = atob(encoded), bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
	static code = "ERR_JOSE_GENERIC";
	code = "ERR_JOSE_GENERIC";
	constructor(message, options) {
		super(message, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
	}
};
var JWTClaimValidationFailed = class extends JOSEError {
	static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JWTExpired = class extends JOSEError {
	static code = "ERR_JWT_EXPIRED";
	code = "ERR_JWT_EXPIRED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JOSEAlgNotAllowed = class extends JOSEError {
	static code = "ERR_JOSE_ALG_NOT_ALLOWED";
	code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
	static code = "ERR_JOSE_NOT_SUPPORTED";
	code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
	static code = "ERR_JWS_INVALID";
	code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
	static code = "ERR_JWT_INVALID";
	code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
	static code = "ERR_JWKS_INVALID";
	code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
	static code = "ERR_JWKS_NO_MATCHING_KEY";
	code = "ERR_JWKS_NO_MATCHING_KEY";
	constructor(message = "no applicable key found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
	[Symbol.asyncIterator] = async function* () {};
	static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
	constructor(message = "multiple matching keys found in the JSON Web Key Set", options) {
		super(message, options);
	}
};
var JWKSTimeout = class extends JOSEError {
	static code = "ERR_JWKS_TIMEOUT";
	code = "ERR_JWKS_TIMEOUT";
	constructor(message = "request timed out", options) {
		super(message, options);
	}
};
var JWSSignatureVerificationFailed = class extends JOSEError {
	static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	constructor(message = "signature verification failed", options) {
		super(message, options);
	}
};
// node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
	try {
		return decodeBase64(typeof input == "string" ? input : decoder.decode(input), !0);
	} catch (cause) {
		throw new TypeError(invalid, { cause });
	}
}
// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
	if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") return !1;
	const prototype = Object.getPrototypeOf(input);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isJwkSet(input) {
	return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
function isDisjoint(...headers) {
	const parameters = /* @__PURE__ */ new Set();
	for (const header of headers) if (header) for (const parameter of Object.keys(header)) {
		if (parameters.has(parameter)) return !1;
		parameters.add(parameter);
	}
	return !0;
}
function decodeBase64url(value, label, ErrorClass) {
	try {
		return decode(value);
	} catch (cause) {
		throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
	}
}
function encodeAsciiMember(value, label, ErrorClass) {
	try {
		return encode(value);
	} catch (cause) {
		throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
	}
}
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message) {
	let parsed;
	try {
		parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
	} catch (cause) {
		throw new ErrorClass(message, { cause });
	}
	if (!isObject(parsed)) throw new ErrorClass(message);
	return parsed;
}
var JWS_RECOGNIZED = {
	__proto__: null,
	b64: !0
};
function validateAlgorithms(option, algorithms) {
	if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string"))) throw new TypeError(`"${option}" option must be an array of strings`);
	return algorithms === void 0 ? void 0 : new Set(algorithms);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
	if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) throw new Err("\"crit\" (Critical) Header Parameter MUST be integrity protected");
	if (!protectedHeader || protectedHeader.crit === void 0) return [];
	if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0)) throw new Err("\"crit\" (Critical) Header Parameter MUST be an array of non-empty strings when present");
	const recognized = recognizedOption === void 0 ? recognizedDefault : {
		__proto__: null,
		...recognizedOption,
		...recognizedDefault
	};
	for (const parameter of protectedHeader.crit) {
		if (!(parameter in recognized)) throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
		if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) throw new Err(`Extension Header Parameter "${parameter}" is missing`);
		if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
	}
	return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
	if (extensions.includes("b64")) {
		const b64 = protectedHeader.b64;
		if (typeof b64 != "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
		return b64;
	}
	return !0;
}
// node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
	const { alg } = entry;
	if (key.use !== void 0) {
		const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
		if (key.use !== expected) throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
	}
	if (key.alg !== void 0 && key.alg !== alg) throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
	if (Array.isArray(key.key_ops)) {
		const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
		if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
	}
};
async function prepareKey(entry, key, usage) {
	const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
	if (secret && key instanceof Uint8Array) return key;
	let normalized, keyObject;
	if (isObject(key)) {
		if (normalized = normalizeJwk(key), typeof normalized.kty != "string") throw invalidKeyType(alg, key, secret);
		if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0))) throw new TypeError(secret ? "JSON Web Key for symmetric algorithms must have JWK \"kty\" (Key Type) equal to \"oct\" and the JWK \"k\" (Key Value) present" : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
		if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct") return decode(normalized.k);
		if (!Object.isFrozen(key)) {
			const { key_ops } = key;
			Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
		}
	} else {
		if (!isKeyLike(key)) throw invalidKeyType(alg, key, secret);
		const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
		if (key.type !== expectedType && (secret || [
			"secret",
			"public",
			"private"
		].includes(key.type))) throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
		if (isCryptoKey(key)) return key;
		if (keyObject = key, keyObject.type === "secret") return keyObject.export();
	}
	cache ||= /* @__PURE__ */ new WeakMap();
	const cacheKey = key;
	let cached = cache.get(cacheKey);
	if (cached?.[alg]) return cached[alg];
	if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
		const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({
			crv,
			asymmetricKeyType: keyObject.asymmetricKeyType
		}) ?? entry.subtle;
		return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
	}
	return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
var cache;
var nist = {
	__proto__: null,
	prime256v1: "P-256",
	secp384r1: "P-384",
	secp521r1: "P-521"
};
var isCryptoKey = (key) => {
	if (key?.[Symbol.toStringTag] === "CryptoKey") return !0;
	try {
		return key instanceof CryptoKey;
	} catch {
		return !1;
	}
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function message(msg, actual, ...types) {
	if (types.length > 2) {
		const last = types.pop();
		msg += `one of type ${types.join(", ")}, or ${last}.`;
	} else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
	return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
	const types = [
		"CryptoKey",
		"KeyObject",
		"JSON Web Key"
	];
	return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
var unusable = (name, prop = "algorithm.name") => /* @__PURE__ */ new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
	if (usage && !key.usages.includes(usage)) throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
	const { modulusLength } = key.algorithm;
	if (typeof modulusLength != "number" || modulusLength < 2048) throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
	const algorithm = key.algorithm;
	if (algorithm.name !== expected.name) throw unusable(expected.name);
	if (expected.hash && algorithm.hash?.name !== expected.hash) throw unusable(expected.hash, "algorithm.hash");
	if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) throw unusable(expected.namedCurve, "algorithm.namedCurve");
	if (expected.length !== void 0 && algorithm.length !== expected.length) throw unusable(expected.length, "algorithm.length");
	checkUsage(key, usage);
}
function snapshotJwk(jwk) {
	return {
		__proto__: null,
		...jwk
	};
}
function normalizeJwk(jwk) {
	const normalized = snapshotJwk(jwk);
	if (normalized.ext !== void 0 && typeof normalized.ext != "boolean") throw new TypeError("\"ext\" (Extractable) Parameter must be a boolean");
	if (normalized.key_ops !== void 0) {
		const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
		if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length) throw new TypeError("\"key_ops\" (Key Operations) Parameter must be an array of unique strings");
		normalized.key_ops = keyOps;
	}
	return normalized;
}
async function jwkToKey(entry, jwk, extractable) {
	if (!entry.kty.includes(jwk.kty)) throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
	const algorithm = entry.resolve?.({
		kty: jwk.kty,
		crv: jwk.crv
	}) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = {
		...jwk,
		ext: extractable ?? jwk.ext
	};
	return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = !1) {
	return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
	const out = { __proto__: null };
	for (const alg in entries) out[alg] = {
		...entries[alg],
		alg
	};
	return out;
}
// node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
	const subtle = {
		name: "HMAC",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["oct"],
		secret: !0,
		subtle,
		signing: subtle,
		usages: sig
	};
}
function rsa(bits, saltLength) {
	const subtle = {
		name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["RSA"],
		subtle,
		signing: saltLength ? {
			...subtle,
			saltLength
		} : subtle,
		usages: sig,
		minRsaBits: 2048
	};
}
function ecdsa(crv, bits) {
	return {
		kty: ["EC"],
		crv,
		subtle: {
			name: "ECDSA",
			namedCurve: crv
		},
		signing: {
			name: "ECDSA",
			hash: `SHA-${bits}`
		},
		usages: sig
	};
}
function eddsa() {
	const subtle = { name: "Ed25519" };
	return {
		kty: ["OKP"],
		crv: "Ed25519",
		subtle,
		signing: subtle,
		usages: sig
	};
}
function mldsa(parameterSet) {
	const subtle = { name: `ML-DSA-${parameterSet}` };
	return {
		kty: ["AKP"],
		subtle,
		signing: subtle,
		usages: sig
	};
}
var JWS = table({
	HS256: hmac(256),
	HS384: hmac(384),
	HS512: hmac(512),
	RS256: rsa(256),
	RS384: rsa(384),
	RS512: rsa(512),
	PS256: rsa(256, 32),
	PS384: rsa(384, 48),
	PS512: rsa(512, 64),
	ES256: ecdsa("P-256", 256),
	ES384: ecdsa("P-384", 384),
	ES512: ecdsa("P-521", 512),
	EdDSA: eddsa(),
	Ed25519: eddsa(),
	"ML-DSA-44": mldsa(44),
	"ML-DSA-65": mldsa(65),
	"ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
	const entry = typeof alg == "string" ? JWS[alg] : void 0;
	if (!entry) throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
	return entry;
}
// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
	return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtectedHeader) {
	return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeCompactUnencodedPayload(payload) {
	try {
		return encode(payload);
	} catch (cause) {
		throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", { cause });
	}
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
	const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
	if (!isDisjoint(protectedHeader, header)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...header
	}, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (shared[0] && !shared[0].has(alg)) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (b64) {
		if (typeof inputPayload != "string") throw new JWSInvalid("JWS Payload must be a string");
	} else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array)) throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
	const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
	let resolvedKey = !1;
	typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = !0);
	const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : /* @__PURE__ */ new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
	entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
	let verified = !1;
	try {
		verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
	} catch (cause) {
		throw new JWSSignatureVerificationFailed(void 0, { cause });
	}
	if (!verified) throw new JWSSignatureVerificationFailed();
	const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
	return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{
		...result,
		key: verificationKey
	}, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
	if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string") throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
	const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
	if (length !== 3) throw new JWSInvalid("Invalid Compact JWS");
	return verifySignature({
		payload,
		protected: protectedHeader,
		signature
	}, shared, key, encodeCompactUnencodedPayload);
}
// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1e3);
var multipliers = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
	y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
	throw new TypeError("Invalid time period format");
}
function secs(str) {
	typeof str != "string" && invalidDuration();
	const matched = REGEX.exec(str);
	(!matched || matched[4] && matched[1]) && invalidDuration();
	const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
	return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
function validateInput(label, input) {
	if (!Number.isFinite(input)) throw new TypeError(`Invalid ${label} input`);
	return input;
}
var normalizeTyp = (value) => {
	const normalized = value.toLowerCase();
	return value.includes("/") ? normalized : `application/${normalized}`;
};
var checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : !1;
function validateNumericDate(claimsSet, claim, required = !1) {
	const value = claimsSet[claim];
	if (!(value === void 0 && !required)) {
		if (typeof value != "number") throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
		return value;
	}
}
function unexpectedClaim(claimsSet, claim) {
	throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
	let claimsSet;
	try {
		claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
	} catch (cause) {
		throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
	}
	if (!isObject(claimsSet)) throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
	const { typ } = options;
	if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) throw new JWTClaimValidationFailed("unexpected \"typ\" JWT header value", claimsSet, "typ", checkFailed);
	const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
	maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
	for (const claim of new Set(presenceCheck.reverse())) if (!Object.hasOwn(claimsSet, claim)) throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
	issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
	const { clockTolerance } = options;
	let tolerance = 0;
	if (typeof clockTolerance == "string") tolerance = secs(clockTolerance);
	else if (clockTolerance !== void 0) {
		if (typeof clockTolerance != "number") throw new TypeError("Invalid clockTolerance option type");
		tolerance = clockTolerance;
	}
	validateInput("clockTolerance option", tolerance);
	const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
	if (nbf !== void 0 && nbf > now + tolerance) throw new JWTClaimValidationFailed("\"nbf\" claim timestamp check failed", claimsSet, "nbf", checkFailed);
	const exp = validateNumericDate(claimsSet, "exp");
	if (exp !== void 0 && exp <= now - tolerance) throw new JWTExpired("\"exp\" claim timestamp check failed", claimsSet, "exp", checkFailed);
	if (maxTokenAge !== void 0) {
		const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
		if (age - tolerance > max) throw new JWTExpired("\"iat\" claim timestamp check failed (too far in the past)", claimsSet, "iat", checkFailed);
		if (age < -tolerance) throw new JWTClaimValidationFailed("\"iat\" claim timestamp check failed (it should be in the past)", claimsSet, "iat", checkFailed);
	}
	return claimsSet;
}
// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
	const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
	if (!b64) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
	const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
	return {
		...verified,
		payload
	};
}
// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
	const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
	return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
async function importWithAlgCache(cache, jwk, entry) {
	const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk), { alg } = entry;
	if (cached[alg] === void 0) {
		const pending = jwkToKey(entry, jwk, !0).then((key) => {
			if (key.type !== "public") throw new JWKSInvalid("JSON Web Key Set members must be public keys");
			return cached[alg] = key, key;
		}).catch((error) => {
			throw cached[alg] === pending && delete cached[alg], error;
		});
		cached[alg] = pending;
	}
	return cached[alg];
}
function createLocalJWKSet(jwks) {
	let snapshot;
	try {
		snapshot = structuredClone(jwks);
	} catch (cause) {
		throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
	}
	if (!isJwkSet(snapshot)) throw new JWKSInvalid("JSON Web Key Set malformed");
	const metadata = snapshot.keys.map((jwk) => {
		const normalized = snapshotJwk(jwk);
		return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
	}), cached = /* @__PURE__ */ new WeakMap();
	return Object.defineProperty(async (protectedHeader, token) => {
		const { alg, kid } = {
			...protectedHeader,
			...token?.header
		}, entry = typeof alg == "string" ? JWS[alg] : void 0;
		if (!entry || entry.secret) throw new JOSENotSupported("Unsupported \"alg\" value for a JSON Web Key Set");
		const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
		if (!length) throw new JWKSNoMatchingKey();
		if (length !== 1) {
			const error = new JWKSMultipleMatchingKeys();
			throw error[Symbol.asyncIterator] = async function* () {
				for (const jwk2 of candidates) try {
					yield await importWithAlgCache(cached, jwk2, entry);
				} catch {}
			}, error;
		}
		return importWithAlgCache(cached, jwk, entry);
	}, "jwks", { value: () => structuredClone(snapshot) });
}
// node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
	return typeof WebSocketPair < "u" || typeof navigator < "u" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
var USER_AGENT;
(typeof navigator > "u" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.13");
var customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
	const response = await fetchImpl(url, {
		method: "GET",
		signal,
		redirect: "manual",
		headers
	}).catch((err) => {
		throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
	});
	if (response.status !== 200) throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
	try {
		return await response.json();
	} catch (cause) {
		throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
	}
}
var jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp, duration) {
	return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
function validateDuration(value, fallback, option) {
	if (Number.isNaN(value)) throw new TypeError(`"${option}" option must not be NaN`);
	return typeof value == "number" ? value : fallback;
}
function createRemoteJWKSet(url, options) {
	if (!(url instanceof URL)) throw new TypeError("url must be an instance of URL");
	const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
	if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0)) throw new TypeError("\"timeoutDuration\" option must be a non-negative integer");
	const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
	USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
	const fetchImpl = opts[customFetch], cache = opts[jwksCache];
	let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
	if (cache && typeof cache == "object") {
		const { uat, jwks } = cache;
		isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
	}
	const reload = async () => {
		if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
			const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json) => {
				const next = createLocalJWKSet(json);
				if (sequence <= appliedSequence) return;
				local = next;
				const updatedAt = Date.now();
				cache && (cache.uat = updatedAt, cache.jwks = json), jwksTimestamp = updatedAt, appliedSequence = sequence;
			}).finally(() => {
				pendingFetch === current && (pendingFetch = void 0);
			});
		}
		await pendingFetch;
	};
	return Object.defineProperties(async (protectedHeader, token) => {
		(!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
		try {
			return await local(protectedHeader, token);
		} catch (err) {
			if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration)) return await reload(), local(protectedHeader, token);
			throw err;
		}
	}, {
		coolingDown: {
			get: () => isFreshFor(jwksTimestamp, cooldownDuration),
			enumerable: !0
		},
		fresh: {
			get: () => isFreshFor(jwksTimestamp, cacheMaxAge),
			enumerable: !0
		},
		reload: {
			value: reload,
			enumerable: !0
		},
		reloading: {
			get: () => !!pendingFetch,
			enumerable: !0
		},
		jwks: {
			value: () => local?.jwks(),
			enumerable: !0
		}
	});
}
var AUTH_ROUTE_PREFIX = "/auth/freebuff";
var TRANSACTION_TTL = 600;
var SESSION_COOKIE_TTL = 2592e3;
var REFRESH_SKEW_SECONDS = 30;
var MAX_COOKIE_LENGTH = 4e3;
var FETCH_TIMEOUT_MS = 8e3;
var LOOPBACK = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"[::1]"
]);
var ALL_SCOPES = [
	"openid",
	"email",
	"profile"
];
var PROMPTS = /* @__PURE__ */ new Set([
	"login",
	"consent",
	"select_account"
]);
var NO_STORE = {
	"Cache-Control": "private, no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff"
};
function checkedUrl(value, allowLoopback, what) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${what} must be an absolute URL.`);
	}
	const loopbackHttp = allowLoopback && LOOPBACK.has(url.hostname) && url.protocol === "http:";
	if (url.protocol !== "https:" && !loopbackHttp || url.username || url.password || url.search || url.hash) throw new Error(`${what} must be an https URL without credentials, query or fragment (http is allowed only for localhost with allowInsecureLocalhost).`);
	return url;
}
function base64url(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken() {
	return base64url(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
}
async function pkceChallenge(verifier) {
	const bytes = new TextEncoder().encode(verifier);
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
}
/**
* Same-origin check for state-changing browser requests. A page served with
* `Referrer-Policy: no-referrer` posts `Origin: null` even to itself;
* `Sec-Fetch-Site` is browser-set and cannot be forged by page script.
*/
function isSameOriginRequest(request, origin) {
	const header = request.headers.get("origin");
	if (header && header !== "null") return header === origin;
	return request.headers.get("sec-fetch-site") === "same-origin";
}
function timingSafeEqual(left, right) {
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return diff === 0;
}
/** Ambiguous (duplicated) cookies read as absent: fail closed. */
function readCookie(header, name) {
	const values = (header ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
	if (values.length !== 1) return null;
	const value = values[0].slice(name.length + 1);
	return value && value.length <= MAX_COOKIE_LENGTH ? value : null;
}
/** A same-origin path, never another origin or one of the auth routes. */
function safeReturnTo(value) {
	if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
	const base = "https://return-to.invalid";
	let url;
	try {
		url = new URL(value, base);
	} catch {
		return "/";
	}
	if (url.origin !== base || url.pathname === "/auth/freebuff" || url.pathname.startsWith(`/auth/freebuff/`)) return "/";
	return `${url.pathname}${url.search}${url.hash}`;
}
function userFrom(claims, scopes) {
	if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return null;
	const user = { sub: claims.sub };
	if (scopes.includes("email")) {
		if (typeof claims.email === "string" && claims.email.length <= 320) user.email = claims.email;
		if (typeof claims.email_verified === "boolean") user.email_verified = claims.email_verified;
	}
	if (scopes.includes("profile")) {
		if (typeof claims.name === "string" && claims.name.length <= 200) user.name = claims.name;
		if (typeof claims.picture === "string" && claims.picture.startsWith("https://") && claims.picture.length <= 1024) user.picture = claims.picture;
	}
	return user;
}
function json(body, status = 200, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		"Content-Type": "application/json; charset=utf-8"
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(JSON.stringify(body), {
		status,
		headers
	});
}
function redirect(location, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		Location: location
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(null, {
		status: 303,
		headers
	});
}
function problem(status, message, cookies = []) {
	const headers = new Headers({
		...NO_STORE,
		"Content-Type": "text/plain; charset=utf-8"
	});
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(message, {
		status,
		headers
	});
}
async function readJson(response) {
	const text = await response.text();
	if (text.length > 65536) throw new Error("Freebuff response too large");
	const value = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected Freebuff response");
	return value;
}
function createFreebuffAuth(options) {
	const allowLoopback = options.allowInsecureLocalhost === true;
	const issuer = (options.issuer ?? "https://freebuff.com/oidc").replace(/\/$/, "");
	const issuerUrl = checkedUrl(issuer, allowLoopback, "issuer");
	const base = checkedUrl(options.baseUrl, allowLoopback, "baseUrl");
	if (base.pathname !== "/") throw new Error("baseUrl must be an origin, without a path.");
	const origin = base.origin;
	const clientId = options.clientId;
	if (!/^[A-Za-z0-9_-]{1,200}$/.test(clientId ?? "")) throw new Error("clientId is missing or malformed; use the ID from Freebuff provisioning.");
	const scopes = ALL_SCOPES.filter((scope) => scope === "openid" || (options.scopes ?? ALL_SCOPES).includes(scope));
	const now = options.now ?? Date.now;
	const fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const secure = base.protocol === "https:";
	const cookiePrefix = secure ? "__Host-" : "";
	const sessionCookie = `${cookiePrefix}freebuff_session`;
	const transactionCookie = (state) => `${cookiePrefix}freebuff_txn-${state.slice(0, 16)}`;
	const callbackUrl = `${origin}${AUTH_ROUTE_PREFIX}/callback`;
	const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
	const clearCookie = (name) => setCookie(name, "", 0);
	const sessionCookieFor = (session) => {
		const value = `v1~${session.accessToken}~${session.refreshToken}`;
		if (value.length > MAX_COOKIE_LENGTH) throw new Error("Freebuff session is too large for a cookie");
		return setCookie(sessionCookie, value, SESSION_COOKIE_TTL);
	};
	async function freebuffFetch(input, init = {}) {
		const response = await fetcher(input, {
			...init,
			redirect: "manual",
			credentials: "omit",
			signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
		if (response.status >= 300 && response.status < 400) {
			await response.body?.cancel();
			throw new Error("Freebuff endpoint returned a redirect");
		}
		return response;
	}
	let discovery;
	function endpoints() {
		discovery ??= (async () => {
			const response = await freebuffFetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
			if (!response.ok) throw new Error(`Freebuff discovery failed: ${response.status}`);
			const document = await readJson(response);
			if (document.issuer !== issuer) throw new Error("Freebuff discovery named a different issuer");
			const endpoint = (name, required = true) => {
				const value = document[name];
				if (typeof value !== "string") {
					if (required) throw new Error(`Freebuff discovery is missing ${name}`);
					return null;
				}
				const url = checkedUrl(value, allowLoopback, name);
				if (url.origin !== issuerUrl.origin) throw new Error(`Freebuff ${name} left the issuer origin`);
				return url.href;
			};
			return {
				authorization: endpoint("authorization_endpoint"),
				token: endpoint("token_endpoint"),
				revocation: endpoint("revocation_endpoint", false),
				keys: createRemoteJWKSet(new URL(endpoint("jwks_uri")), {
					[customFetch]: (url, init) => freebuffFetch(url, init),
					timeoutDuration: FETCH_TIMEOUT_MS
				})
			};
		})().catch((error) => {
			discovery = void 0;
			throw error;
		});
		return discovery;
	}
	function readSession(request) {
		const value = readCookie(request.headers.get("cookie"), sessionCookie);
		const match = value ? /^v1~([A-Za-z0-9._-]+)~(fbrt_[A-Za-z0-9_-]+)$/.exec(value) : null;
		return match ? {
			accessToken: match[1],
			refreshToken: match[2]
		} : null;
	}
	async function verifyAccessToken(token) {
		try {
			const { payload } = await jwtVerify(token, (await endpoints()).keys, {
				issuer,
				audience: clientId,
				algorithms: ["RS256"],
				typ: "at+jwt",
				requiredClaims: [
					"sub",
					"exp",
					"iat",
					"client_id"
				],
				clockTolerance: 5,
				currentDate: new Date(now())
			});
			if (payload.client_id !== clientId) return null;
			const user = userFrom(payload, scopes);
			if (!user) return null;
			if (payload.exp <= Math.floor(now() / 1e3) + REFRESH_SKEW_SECONDS) return "expired";
			return {
				user,
				expiresAt: payload.exp
			};
		} catch (error) {
			return error instanceof JWTExpired ? "expired" : null;
		}
	}
	/** New tokens, `invalid` (the session is over), or `unavailable` (try again later). */
	async function refresh(refreshToken) {
		let response;
		try {
			response = await freebuffFetch((await endpoints()).token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json"
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: clientId,
					refresh_token: refreshToken
				})
			});
		} catch {
			return "unavailable";
		}
		const body = await readJson(response).catch(() => null);
		if (!response.ok) return body?.error === "invalid_grant" || body?.error === "invalid_client" ? "invalid" : "unavailable";
		if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string") return "unavailable";
		const verified = await verifyAccessToken(body.access_token);
		if (!verified || verified === "expired") return "unavailable";
		return {
			accessToken: body.access_token,
			refreshToken: body.refresh_token,
			user: verified.user
		};
	}
	async function authenticate(request) {
		const session = readSession(request);
		if (!session) return {
			user: null,
			cookies: []
		};
		const verified = await verifyAccessToken(session.accessToken);
		if (verified && verified !== "expired") return {
			user: verified.user,
			cookies: []
		};
		if (verified === null) return {
			user: null,
			cookies: []
		};
		const refreshed = await refresh(session.refreshToken);
		if (refreshed === "invalid") return {
			user: null,
			cookies: [clearCookie(sessionCookie)]
		};
		if (refreshed === "unavailable") return {
			user: null,
			cookies: []
		};
		return {
			user: refreshed.user,
			cookies: [sessionCookieFor(refreshed)]
		};
	}
	const contexts = /* @__PURE__ */ new WeakMap();
	async function getUser(request) {
		const context = contexts.get(request);
		if (context) {
			context.result ??= authenticate(request);
			return (await context.result).user;
		}
		const session = readSession(request);
		if (!session) return null;
		const verified = await verifyAccessToken(session.accessToken);
		return verified && verified !== "expired" ? verified.user : null;
	}
	async function signIn(url) {
		let authorization;
		try {
			authorization = (await endpoints()).authorization;
		} catch {
			return problem(503, "Sign in with Freebuff is temporarily unavailable. Please try again.");
		}
		const state = randomToken();
		const nonce = randomToken();
		const verifier = randomToken();
		const target = new URL(authorization);
		target.search = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: callbackUrl,
			scope: scopes.join(" "),
			state,
			nonce,
			code_challenge: await pkceChallenge(verifier),
			code_challenge_method: "S256"
		}).toString();
		const prompt = url.searchParams.get("prompt");
		if (prompt && PROMPTS.has(prompt)) target.searchParams.set("prompt", prompt);
		const transaction = base64url(new TextEncoder().encode(JSON.stringify({
			s: state,
			n: nonce,
			v: verifier,
			r: safeReturnTo(url.searchParams.get("returnTo"))
		})));
		return redirect(target.href, [setCookie(transactionCookie(state), transaction, TRANSACTION_TTL)]);
	}
	function readTransaction(request, state) {
		const raw = readCookie(request.headers.get("cookie"), transactionCookie(state));
		if (!raw) return null;
		try {
			const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
			const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
			if (typeof decoded.s !== "string" || typeof decoded.n !== "string" || typeof decoded.v !== "string" || !timingSafeEqual(decoded.s, state)) return null;
			return {
				nonce: decoded.n,
				verifier: decoded.v,
				returnTo: safeReturnTo(typeof decoded.r === "string" ? decoded.r : "/")
			};
		} catch {
			return null;
		}
	}
	async function callback(request, url) {
		const params = url.searchParams;
		const state = params.get("state") ?? "";
		if (!/^[A-Za-z0-9_-]{43}$/.test(state) || [...params.keys()].some((key) => params.getAll(key).length > 1)) return problem(400, "This sign-in link is invalid. Please sign in again.");
		const transaction = readTransaction(request, state);
		const clearTransaction = clearCookie(transactionCookie(state));
		if (!transaction) return problem(400, "This sign-in expired or was started in another browser. Please sign in again.", [clearTransaction]);
		if (params.get("iss") !== issuer) return problem(400, "Sign-in response came from an unexpected issuer.", [clearTransaction]);
		const error = params.get("error");
		if (error) {
			if (error === "access_denied") return redirect(transaction.returnTo, [clearTransaction]);
			return problem(400, "Sign in with Freebuff did not complete. Please try again.", [clearTransaction]);
		}
		const code = params.get("code");
		if (!code || code.length > 512) return problem(400, "This sign-in link is invalid. Please sign in again.", [clearTransaction]);
		try {
			const { token, keys } = await endpoints();
			const response = await freebuffFetch(token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json"
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					client_id: clientId,
					code,
					redirect_uri: callbackUrl,
					code_verifier: transaction.verifier
				})
			});
			const tokens = await readJson(response);
			if (!response.ok || typeof tokens.id_token !== "string" || typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") throw new Error("token exchange failed");
			const { payload } = await jwtVerify(tokens.id_token, keys, {
				issuer,
				audience: clientId,
				algorithms: ["RS256"],
				requiredClaims: [
					"sub",
					"exp",
					"iat",
					"nonce"
				],
				maxTokenAge: TRANSACTION_TTL,
				clockTolerance: 5,
				currentDate: new Date(now())
			});
			if (typeof payload.nonce !== "string" || !timingSafeEqual(payload.nonce, transaction.nonce) || payload.azp !== void 0 && payload.azp !== clientId) throw new Error("ID token is not bound to this sign-in");
			const access = await verifyAccessToken(tokens.access_token);
			if (!access || access === "expired" || access.user.sub !== payload.sub) throw new Error("access token does not match the ID token");
			return redirect(transaction.returnTo, [sessionCookieFor({
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token
			}), clearTransaction]);
		} catch {
			return problem(400, "Sign in with Freebuff could not be completed. Please try again.", [clearTransaction]);
		}
	}
	async function signOut(request, url) {
		if (!isSameOriginRequest(request, origin)) return problem(403, "Sign-out must be submitted from this site.");
		const session = readSession(request);
		if (session) try {
			const { revocation } = await endpoints();
			if (revocation) await freebuffFetch(revocation, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: clientId,
					token: session.refreshToken,
					token_type_hint: "refresh_token"
				})
			});
		} catch {}
		let returnTo = url.searchParams.get("returnTo");
		const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
		if (!returnTo && type === "application/x-www-form-urlencoded") {
			const text = await request.text().catch(() => "");
			if (text.length <= 4096) returnTo = new URLSearchParams(text).get("returnTo");
		}
		return redirect(safeReturnTo(returnTo), [clearCookie(sessionCookie)]);
	}
	async function handle(request) {
		const url = new URL(request.url);
		if (!url.pathname.startsWith(`/auth/freebuff/`)) return null;
		const route = url.pathname.slice(14);
		const method = request.method;
		switch (route) {
			case "/signin": return method === "GET" ? signIn(url) : problem(405, "Use GET.");
			case "/callback": return method === "GET" ? callback(request, url) : problem(405, "Use GET.");
			case "/signout": return method === "POST" ? signOut(request, url) : problem(405, "Use POST.");
			case "/session": {
				if (method !== "GET") return problem(405, "Use GET.");
				const { user, cookies } = await authenticate(request);
				return json({ user }, 200, cookies);
			}
			default: return null;
		}
	}
	function wrap(handler) {
		return async (request, ...rest) => {
			const own = await handle(request);
			if (own) return own;
			const context = {};
			contexts.set(request, context);
			const response = await handler(request, ...rest);
			const cookies = context.result ? (await context.result).cookies : [];
			if (cookies.length === 0 || response.status === 101) return response;
			const headers = new Headers(response.headers);
			for (const cookie of cookies) headers.append("Set-Cookie", cookie);
			headers.set("Cache-Control", "private, no-store");
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		};
	}
	return {
		issuer,
		clientId,
		handle,
		authenticate,
		getUser,
		wrap
	};
}
// node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var relaxedCookieNameRegEx = /^[!#-:<>-[\]-~]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = (value) => {
	let start = 0;
	let end = value.length;
	while (start < end) {
		const charCode = value.charCodeAt(start);
		if (charCode !== 32 && charCode !== 9) break;
		start++;
	}
	while (end > start) {
		const charCode = value.charCodeAt(end - 1);
		if (charCode !== 32 && charCode !== 9) break;
		end--;
	}
	return start === 0 && end === value.length ? value : value.slice(start, end);
};
var parse = (cookie, name) => {
	if (name && cookie.indexOf(name) === -1) return {};
	const pairs = cookie.split(";");
	const parsedCookie = Object.create(null);
	for (const pairStr of pairs) {
		const valueStartPos = pairStr.indexOf("=");
		if (valueStartPos === -1) continue;
		const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
		if (name && name !== cookieName || !relaxedCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) continue;
		let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
		if (cookieValue.startsWith("\"") && cookieValue.endsWith("\"")) cookieValue = cookieValue.slice(1, -1);
		if (validCookieValueRegEx.test(cookieValue)) {
			parsedCookie[cookieName] = tryDecodeURIComponent(cookieValue);
			if (name) break;
		}
	}
	return parsedCookie;
};
var _serialize = (name, value, opt = {}) => {
	if (!validCookieNameRegEx.test(name)) throw new Error("Invalid cookie name");
	let cookie = `${name}=${value}`;
	if (name.startsWith("__Secure-") && !opt.secure) throw new Error("__Secure- Cookie must have Secure attributes");
	if (name.startsWith("__Host-")) {
		if (!opt.secure) throw new Error("__Host- Cookie must have Secure attributes");
		if (opt.path !== "/") throw new Error("__Host- Cookie must have Path attributes with \"/\"");
		if (opt.domain) throw new Error("__Host- Cookie must not have Domain attributes");
	}
	for (const key of [
		"domain",
		"path",
		"sameSite",
		"priority"
	]) if (opt[key] && /[;\r\n]/.test(opt[key])) throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
	if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
		if (opt.maxAge > 3456e4) throw new Error("Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration.");
		cookie += `; Max-Age=${opt.maxAge | 0}`;
	}
	if (opt.domain && opt.prefix !== "host") cookie += `; Domain=${opt.domain}`;
	if (opt.path) cookie += `; Path=${opt.path}`;
	if (opt.expires) {
		if (opt.expires.getTime() - Date.now() > 3456e7) throw new Error("Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future.");
		cookie += `; Expires=${opt.expires.toUTCString()}`;
	}
	if (opt.httpOnly) cookie += "; HttpOnly";
	if (opt.secure) cookie += "; Secure";
	if (opt.sameSite) cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
	if (opt.priority) cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
	if (opt.partitioned) {
		if (!opt.secure) throw new Error("Partitioned Cookie must have Secure attributes");
		cookie += "; Partitioned";
	}
	return cookie;
};
var serialize = (name, value, opt) => {
	value = encodeURIComponent(value);
	return _serialize(name, value, opt);
};
// node_modules/hono/dist/helper/cookie/index.js
var getCookie = (c, key, prefix) => {
	const cookie = c.req.raw.headers.get("Cookie");
	if (typeof key === "string") {
		if (!cookie) return;
		let finalKey = key;
		if (prefix === "secure") finalKey = "__Secure-" + key;
		else if (prefix === "host") finalKey = "__Host-" + key;
		return parse(cookie, finalKey)[finalKey];
	}
	if (!cookie) return {};
	return parse(cookie);
};
var generateCookie = (name, value, opt) => {
	let cookie;
	if (opt?.prefix === "secure") cookie = serialize("__Secure-" + name, value, {
		path: "/",
		...opt,
		secure: true
	});
	else if (opt?.prefix === "host") cookie = serialize("__Host-" + name, value, {
		...opt,
		path: "/",
		secure: true,
		domain: void 0
	});
	else cookie = serialize(name, value, {
		path: "/",
		...opt
	});
	return cookie;
};
var setCookie = (c, name, value, opt) => {
	const cookie = generateCookie(name, value, opt);
	c.header("Set-Cookie", cookie, { append: true });
};
// node_modules/hono/dist/middleware/body-limit/index.js
var ERROR_MESSAGE = "Payload Too Large";
/**
* Body Limit Middleware for Hono.
*
* @see {@link https://hono.dev/docs/middleware/builtin/body-limit}
*
* @param {BodyLimitOptions} options - The options for the body limit middleware.
* @param {number} options.maxSize - The maximum body size allowed.
* @param {OnError} [options.onError] - The error handler to be invoked if the specified body size is exceeded.
* @returns {MiddlewareHandler} The middleware handler function.
*
* @example
* ```ts
* const app = new Hono()
*
* app.post(
*   '/upload',
*   bodyLimit({
*     maxSize: 50 * 1024, // 50kb
*     onError: (c) => {
*       return c.text('overflow :(', 413)
*     },
*   }),
*   async (c) => {
*     const body = await c.req.parseBody()
*     if (body['file'] instanceof File) {
*       console.log(`Got file sized: ${body['file'].size}`)
*     }
*     return c.text('pass :)')
*   }
* )
* ```
*/
var bodyLimit = (options) => {
	const onError = options.onError || (() => {
		throw new HTTPException(413, { res: new Response(ERROR_MESSAGE, { status: 413 }) });
	});
	const maxSize = options.maxSize;
	return async function bodyLimit(c, next) {
		if (!c.req.raw.body) return next();
		const hasTransferEncoding = c.req.raw.headers.has("transfer-encoding");
		if (c.req.raw.headers.has("content-length") && !hasTransferEncoding) return parseInt(c.req.raw.headers.get("content-length") || "0", 10) > maxSize ? onError(c) : next();
		let size = 0;
		const chunks = [];
		const rawReader = c.req.raw.body.getReader();
		for (;;) {
			const { done, value } = await rawReader.read();
			if (done) break;
			size += value.length;
			if (size > maxSize) return onError(c);
			chunks.push(value);
		}
		const requestInit = {
			body: new ReadableStream({ start(controller) {
				for (const chunk of chunks) controller.enqueue(chunk);
				controller.close();
			} }),
			duplex: "half"
		};
		c.req.raw = new Request(c.req.raw, requestInit);
		return next();
	};
};
// node_modules/chess.js/dist/esm/chess.js
function rootNode(comment) {
	return comment !== null ? {
		comment,
		variations: []
	} : { variations: [] };
}
function node(move, suffix, nag, comment, variations) {
	const node = {
		move,
		variations
	};
	if (suffix) node.suffix = suffix;
	if (nag) node.nag = nag;
	if (comment !== null) node.comment = comment;
	return node;
}
function lineToTree(...nodes) {
	const [root, ...rest] = nodes;
	let parent = root;
	for (const child of rest) if (child !== null) {
		parent.variations = [child, ...child.variations];
		child.variations = [];
		parent = child;
	}
	return root;
}
function pgn(headers, game) {
	if (game.marker && game.marker.comment) {
		let node = game.root;
		while (true) {
			const next = node.variations[0];
			if (!next) {
				node.comment = game.marker.comment;
				break;
			}
			node = next;
		}
	}
	return {
		headers,
		root: game.root,
		result: (game.marker && game.marker.result) ?? void 0
	};
}
function peg$subclass(child, parent) {
	function C() {
		this.constructor = child;
	}
	C.prototype = parent.prototype;
	child.prototype = new C();
}
function peg$SyntaxError(message, expected, found, location) {
	var self = Error.call(this, message);
	// istanbul ignore next Check is a necessary evil to support older environments
	if (Object.setPrototypeOf) Object.setPrototypeOf(self, peg$SyntaxError.prototype);
	self.expected = expected;
	self.found = found;
	self.location = location;
	self.name = "SyntaxError";
	return self;
}
peg$subclass(peg$SyntaxError, Error);
function peg$padEnd(str, targetLength, padString) {
	padString = padString || " ";
	if (str.length > targetLength) return str;
	targetLength -= str.length;
	padString += padString.repeat(targetLength);
	return str + padString.slice(0, targetLength);
}
peg$SyntaxError.prototype.format = function(sources) {
	var str = "Error: " + this.message;
	if (this.location) {
		var src = null;
		var k = 0;
		for (; k < sources.length; k++) if (sources[k].source === this.location.source) {
			src = sources[k].text.split(/\r\n|\n|\r/g);
			break;
		}
		var s = this.location.start;
		var offset_s = this.location.source && typeof this.location.source.offset === "function" ? this.location.source.offset(s) : s;
		var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
		if (src) {
			var e = this.location.end;
			var filler = peg$padEnd("", offset_s.line.toString().length, " ");
			var line = src[s.line - 1];
			var hatLen = (s.line === e.line ? e.column : line.length + 1) - s.column || 1;
			str += "\n --> " + loc + "\n" + filler + " |\n" + offset_s.line + " | " + line + "\n" + filler + " | " + peg$padEnd("", s.column - 1, " ") + peg$padEnd("", hatLen, "^");
		} else str += "\n at " + loc;
	}
	return str;
};
peg$SyntaxError.buildMessage = function(expected, found) {
	var DESCRIBE_EXPECTATION_FNS = {
		literal: function(expectation) {
			return "\"" + literalEscape(expectation.text) + "\"";
		},
		class: function(expectation) {
			var escapedParts = expectation.parts.map(function(part) {
				return Array.isArray(part) ? classEscape(part[0]) + "-" + classEscape(part[1]) : classEscape(part);
			});
			return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";
		},
		any: function() {
			return "any character";
		},
		end: function() {
			return "end of input";
		},
		other: function(expectation) {
			return expectation.description;
		}
	};
	function hex(ch) {
		return ch.charCodeAt(0).toString(16).toUpperCase();
	}
	function literalEscape(s) {
		return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
			return "\\x0" + hex(ch);
		}).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
			return "\\x" + hex(ch);
		});
	}
	function classEscape(s) {
		return s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
			return "\\x0" + hex(ch);
		}).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
			return "\\x" + hex(ch);
		});
	}
	function describeExpectation(expectation) {
		return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
	}
	function describeExpected(expected) {
		var descriptions = expected.map(describeExpectation);
		var i, j;
		descriptions.sort();
		if (descriptions.length > 0) {
			for (i = 1, j = 1; i < descriptions.length; i++) if (descriptions[i - 1] !== descriptions[i]) {
				descriptions[j] = descriptions[i];
				j++;
			}
			descriptions.length = j;
		}
		switch (descriptions.length) {
			case 1: return descriptions[0];
			case 2: return descriptions[0] + " or " + descriptions[1];
			default: return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
		}
	}
	function describeFound(found) {
		return found ? "\"" + literalEscape(found) + "\"" : "end of input";
	}
	return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};
function peg$parse(input, options) {
	options = options !== void 0 ? options : {};
	var peg$FAILED = {};
	var peg$source = options.grammarSource;
	var peg$startRuleFunctions = { pgn: peg$parsepgn };
	var peg$startRuleFunction = peg$parsepgn;
	var peg$c0 = "[";
	var peg$c1 = "\"";
	var peg$c2 = "]";
	var peg$c3 = ".";
	var peg$c4 = "O-O-O";
	var peg$c5 = "O-O";
	var peg$c6 = "0-0-0";
	var peg$c7 = "0-0";
	var peg$c8 = "$";
	var peg$c9 = "{";
	var peg$c10 = "}";
	var peg$c11 = ";";
	var peg$c12 = "(";
	var peg$c13 = ")";
	var peg$c14 = "1-0";
	var peg$c15 = "0-1";
	var peg$c16 = "1/2-1/2";
	var peg$c17 = "*";
	var peg$r0 = /^[a-zA-Z]/;
	var peg$r1 = /^[^"]/;
	var peg$r2 = /^[0-9]/;
	var peg$r3 = /^[.]/;
	var peg$r4 = /^[a-zA-Z1-8\-=]/;
	var peg$r5 = /^[+#]/;
	var peg$r6 = /^[!?]/;
	var peg$r7 = /^[^}]/;
	var peg$r8 = /^[^\r\n]/;
	var peg$r9 = /^[ \t\r\n]/;
	var peg$e0 = peg$otherExpectation("tag pair");
	var peg$e1 = peg$literalExpectation("[", false);
	var peg$e2 = peg$literalExpectation("\"", false);
	var peg$e3 = peg$literalExpectation("]", false);
	var peg$e4 = peg$otherExpectation("tag name");
	var peg$e5 = peg$classExpectation([["a", "z"], ["A", "Z"]], false, false);
	var peg$e6 = peg$otherExpectation("tag value");
	var peg$e7 = peg$classExpectation(["\""], true, false);
	var peg$e8 = peg$otherExpectation("move number");
	var peg$e9 = peg$classExpectation([["0", "9"]], false, false);
	var peg$e10 = peg$literalExpectation(".", false);
	var peg$e11 = peg$classExpectation(["."], false, false);
	var peg$e12 = peg$otherExpectation("standard algebraic notation");
	var peg$e13 = peg$literalExpectation("O-O-O", false);
	var peg$e14 = peg$literalExpectation("O-O", false);
	var peg$e15 = peg$literalExpectation("0-0-0", false);
	var peg$e16 = peg$literalExpectation("0-0", false);
	var peg$e17 = peg$classExpectation([
		["a", "z"],
		["A", "Z"],
		["1", "8"],
		"-",
		"="
	], false, false);
	var peg$e18 = peg$classExpectation(["+", "#"], false, false);
	var peg$e19 = peg$otherExpectation("suffix annotation");
	var peg$e20 = peg$classExpectation(["!", "?"], false, false);
	var peg$e21 = peg$otherExpectation("NAG");
	var peg$e22 = peg$literalExpectation("$", false);
	var peg$e23 = peg$otherExpectation("brace comment");
	var peg$e24 = peg$literalExpectation("{", false);
	var peg$e25 = peg$classExpectation(["}"], true, false);
	var peg$e26 = peg$literalExpectation("}", false);
	var peg$e27 = peg$otherExpectation("rest of line comment");
	var peg$e28 = peg$literalExpectation(";", false);
	var peg$e29 = peg$classExpectation(["\r", "\n"], true, false);
	var peg$e30 = peg$otherExpectation("variation");
	var peg$e31 = peg$literalExpectation("(", false);
	var peg$e32 = peg$literalExpectation(")", false);
	var peg$e33 = peg$otherExpectation("game termination marker");
	var peg$e34 = peg$literalExpectation("1-0", false);
	var peg$e35 = peg$literalExpectation("0-1", false);
	var peg$e36 = peg$literalExpectation("1/2-1/2", false);
	var peg$e37 = peg$literalExpectation("*", false);
	var peg$e38 = peg$otherExpectation("whitespace");
	var peg$e39 = peg$classExpectation([
		" ",
		"	",
		"\r",
		"\n"
	], false, false);
	var peg$f0 = function(headers, game) {
		return pgn(headers, game);
	};
	var peg$f1 = function(tagPairs) {
		return Object.fromEntries(tagPairs);
	};
	var peg$f2 = function(tagName, tagValue) {
		return [tagName, tagValue];
	};
	var peg$f3 = function(root, marker) {
		return {
			root,
			marker
		};
	};
	var peg$f4 = function(comment, moves) {
		return lineToTree(rootNode(comment), ...moves.flat());
	};
	var peg$f5 = function(san, suffix, nag, comment, variations) {
		return node(san, suffix, nag, comment, variations);
	};
	var peg$f6 = function(nag) {
		return nag;
	};
	var peg$f7 = function(comment) {
		return comment.replace(/[\r\n]+/g, " ");
	};
	var peg$f8 = function(comment) {
		return comment.trim();
	};
	var peg$f9 = function(line) {
		return line;
	};
	var peg$f10 = function(result, comment) {
		return {
			result,
			comment
		};
	};
	var peg$currPos = options.peg$currPos | 0;
	var peg$posDetailsCache = [{
		line: 1,
		column: 1
	}];
	var peg$maxFailPos = peg$currPos;
	var peg$maxFailExpected = options.peg$maxFailExpected || [];
	var peg$silentFails = options.peg$silentFails | 0;
	var peg$result;
	if (options.startRule) {
		if (!(options.startRule in peg$startRuleFunctions)) throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
		peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
	}
	function peg$literalExpectation(text, ignoreCase) {
		return {
			type: "literal",
			text,
			ignoreCase
		};
	}
	function peg$classExpectation(parts, inverted, ignoreCase) {
		return {
			type: "class",
			parts,
			inverted,
			ignoreCase
		};
	}
	function peg$endExpectation() {
		return { type: "end" };
	}
	function peg$otherExpectation(description) {
		return {
			type: "other",
			description
		};
	}
	function peg$computePosDetails(pos) {
		var details = peg$posDetailsCache[pos];
		var p;
		if (details) return details;
		else {
			if (pos >= peg$posDetailsCache.length) p = peg$posDetailsCache.length - 1;
			else {
				p = pos;
				while (!peg$posDetailsCache[--p]);
			}
			details = peg$posDetailsCache[p];
			details = {
				line: details.line,
				column: details.column
			};
			while (p < pos) {
				if (input.charCodeAt(p) === 10) {
					details.line++;
					details.column = 1;
				} else details.column++;
				p++;
			}
			peg$posDetailsCache[pos] = details;
			return details;
		}
	}
	function peg$computeLocation(startPos, endPos, offset) {
		var startPosDetails = peg$computePosDetails(startPos);
		var endPosDetails = peg$computePosDetails(endPos);
		return {
			source: peg$source,
			start: {
				offset: startPos,
				line: startPosDetails.line,
				column: startPosDetails.column
			},
			end: {
				offset: endPos,
				line: endPosDetails.line,
				column: endPosDetails.column
			}
		};
	}
	function peg$fail(expected) {
		if (peg$currPos < peg$maxFailPos) return;
		if (peg$currPos > peg$maxFailPos) {
			peg$maxFailPos = peg$currPos;
			peg$maxFailExpected = [];
		}
		peg$maxFailExpected.push(expected);
	}
	function peg$buildStructuredError(expected, found, location) {
		return new peg$SyntaxError(peg$SyntaxError.buildMessage(expected, found), expected, found, location);
	}
	function peg$parsepgn() {
		var s0 = peg$currPos;
		s0 = peg$f0(peg$parsetagPairSection(), peg$parsemoveTextSection());
		return s0;
	}
	function peg$parsetagPairSection() {
		var s0 = peg$currPos, s1 = [], s2 = peg$parsetagPair();
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = peg$parsetagPair();
		}
		s2 = peg$parse_();
		s0 = peg$f1(s1);
		return s0;
	}
	function peg$parsetagPair() {
		var s0, s2, s4, s6, s7, s8, s10;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 91) {
			s2 = peg$c0;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e1);
		}
		if (s2 !== peg$FAILED) {
			peg$parse_();
			s4 = peg$parsetagName();
			if (s4 !== peg$FAILED) {
				peg$parse_();
				if (input.charCodeAt(peg$currPos) === 34) {
					s6 = peg$c1;
					peg$currPos++;
				} else {
					s6 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e2);
				}
				if (s6 !== peg$FAILED) {
					s7 = peg$parsetagValue();
					if (input.charCodeAt(peg$currPos) === 34) {
						s8 = peg$c1;
						peg$currPos++;
					} else {
						s8 = peg$FAILED;
						if (peg$silentFails === 0) peg$fail(peg$e2);
					}
					if (s8 !== peg$FAILED) {
						peg$parse_();
						if (input.charCodeAt(peg$currPos) === 93) {
							s10 = peg$c2;
							peg$currPos++;
						} else {
							s10 = peg$FAILED;
							if (peg$silentFails === 0) peg$fail(peg$e3);
						}
						if (s10 !== peg$FAILED) s0 = peg$f2(s4, s7);
						else {
							peg$currPos = s0;
							s0 = peg$FAILED;
						}
					} else {
						peg$currPos = s0;
						s0 = peg$FAILED;
					}
				} else {
					peg$currPos = s0;
					s0 = peg$FAILED;
				}
			} else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e0);
		}
		return s0;
	}
	function peg$parsetagName() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r0.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e5);
		}
		if (s2 !== peg$FAILED) while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r0.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e5);
			}
		}
		else s1 = peg$FAILED;
		if (s1 !== peg$FAILED) s0 = input.substring(s0, peg$currPos);
		else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e4);
		}
		return s0;
	}
	function peg$parsetagValue() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r1.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e7);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r1.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e7);
			}
		}
		s0 = input.substring(s0, peg$currPos);
		peg$silentFails--;
		s1 = peg$FAILED;
		if (peg$silentFails === 0) peg$fail(peg$e6);
		return s0;
	}
	function peg$parsemoveTextSection() {
		var s0 = peg$currPos, s1 = peg$parseline(), s3;
		peg$parse_();
		s3 = peg$parsegameTerminationMarker();
		if (s3 === peg$FAILED) s3 = null;
		peg$parse_();
		s0 = peg$f3(s1, s3);
		return s0;
	}
	function peg$parseline() {
		var s0 = peg$currPos, s1 = peg$parsecomment(), s2, s3;
		if (s1 === peg$FAILED) s1 = null;
		s2 = [];
		s3 = peg$parsemove();
		while (s3 !== peg$FAILED) {
			s2.push(s3);
			s3 = peg$parsemove();
		}
		s0 = peg$f4(s1, s2);
		return s0;
	}
	function peg$parsemove() {
		var s0 = peg$currPos, s4, s5, s6, s7, s8, s9, s10;
		peg$parse_();
		peg$parsemoveNumber();
		peg$parse_();
		s4 = peg$parsesan();
		if (s4 !== peg$FAILED) {
			s5 = peg$parsesuffixAnnotation();
			if (s5 === peg$FAILED) s5 = null;
			s6 = [];
			s7 = peg$parsenag();
			while (s7 !== peg$FAILED) {
				s6.push(s7);
				s7 = peg$parsenag();
			}
			s7 = peg$parse_();
			s8 = peg$parsecomment();
			if (s8 === peg$FAILED) s8 = null;
			s9 = [];
			s10 = peg$parsevariation();
			while (s10 !== peg$FAILED) {
				s9.push(s10);
				s10 = peg$parsevariation();
			}
			s0 = peg$f5(s4, s5, s6, s8, s9);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		return s0;
	}
	function peg$parsemoveNumber() {
		var s0, s1, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r2.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e9);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			s2 = input.charAt(peg$currPos);
			if (peg$r2.test(s2)) peg$currPos++;
			else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e9);
			}
		}
		if (input.charCodeAt(peg$currPos) === 46) {
			s2 = peg$c3;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e10);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$parse_();
			s4 = [];
			s5 = input.charAt(peg$currPos);
			if (peg$r3.test(s5)) peg$currPos++;
			else {
				s5 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e11);
			}
			while (s5 !== peg$FAILED) {
				s4.push(s5);
				s5 = input.charAt(peg$currPos);
				if (peg$r3.test(s5)) peg$currPos++;
				else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e11);
				}
			}
			s1 = [
				s1,
				s2,
				s3,
				s4
			];
			s0 = s1;
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e8);
		}
		return s0;
	}
	function peg$parsesan() {
		var s0, s1, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = peg$currPos;
		if (input.substr(peg$currPos, 5) === peg$c4) {
			s2 = peg$c4;
			peg$currPos += 5;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e13);
		}
		if (s2 === peg$FAILED) {
			if (input.substr(peg$currPos, 3) === peg$c5) {
				s2 = peg$c5;
				peg$currPos += 3;
			} else {
				s2 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e14);
			}
			if (s2 === peg$FAILED) {
				if (input.substr(peg$currPos, 5) === peg$c6) {
					s2 = peg$c6;
					peg$currPos += 5;
				} else {
					s2 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e15);
				}
				if (s2 === peg$FAILED) {
					if (input.substr(peg$currPos, 3) === peg$c7) {
						s2 = peg$c7;
						peg$currPos += 3;
					} else {
						s2 = peg$FAILED;
						if (peg$silentFails === 0) peg$fail(peg$e16);
					}
					if (s2 === peg$FAILED) {
						s2 = peg$currPos;
						s3 = input.charAt(peg$currPos);
						if (peg$r0.test(s3)) peg$currPos++;
						else {
							s3 = peg$FAILED;
							if (peg$silentFails === 0) peg$fail(peg$e5);
						}
						if (s3 !== peg$FAILED) {
							s4 = [];
							s5 = input.charAt(peg$currPos);
							if (peg$r4.test(s5)) peg$currPos++;
							else {
								s5 = peg$FAILED;
								if (peg$silentFails === 0) peg$fail(peg$e17);
							}
							if (s5 !== peg$FAILED) while (s5 !== peg$FAILED) {
								s4.push(s5);
								s5 = input.charAt(peg$currPos);
								if (peg$r4.test(s5)) peg$currPos++;
								else {
									s5 = peg$FAILED;
									if (peg$silentFails === 0) peg$fail(peg$e17);
								}
							}
							else s4 = peg$FAILED;
							if (s4 !== peg$FAILED) {
								s3 = [s3, s4];
								s2 = s3;
							} else {
								peg$currPos = s2;
								s2 = peg$FAILED;
							}
						} else {
							peg$currPos = s2;
							s2 = peg$FAILED;
						}
					}
				}
			}
		}
		if (s2 !== peg$FAILED) {
			s3 = input.charAt(peg$currPos);
			if (peg$r5.test(s3)) peg$currPos++;
			else {
				s3 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e18);
			}
			if (s3 === peg$FAILED) s3 = null;
			s2 = [s2, s3];
			s1 = s2;
		} else {
			peg$currPos = s1;
			s1 = peg$FAILED;
		}
		if (s1 !== peg$FAILED) s0 = input.substring(s0, peg$currPos);
		else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e12);
		}
		return s0;
	}
	function peg$parsesuffixAnnotation() {
		var s0, s1, s2;
		peg$silentFails++;
		s0 = peg$currPos;
		s1 = [];
		s2 = input.charAt(peg$currPos);
		if (peg$r6.test(s2)) peg$currPos++;
		else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e20);
		}
		while (s2 !== peg$FAILED) {
			s1.push(s2);
			if (s1.length >= 2) s2 = peg$FAILED;
			else {
				s2 = input.charAt(peg$currPos);
				if (peg$r6.test(s2)) peg$currPos++;
				else {
					s2 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e20);
				}
			}
		}
		if (s1.length < 1) {
			peg$currPos = s0;
			s0 = peg$FAILED;
		} else s0 = s1;
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e19);
		}
		return s0;
	}
	function peg$parsenag() {
		var s0, s2, s3, s4, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 36) {
			s2 = peg$c8;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e22);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$currPos;
			s4 = [];
			s5 = input.charAt(peg$currPos);
			if (peg$r2.test(s5)) peg$currPos++;
			else {
				s5 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e9);
			}
			if (s5 !== peg$FAILED) while (s5 !== peg$FAILED) {
				s4.push(s5);
				s5 = input.charAt(peg$currPos);
				if (peg$r2.test(s5)) peg$currPos++;
				else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e9);
				}
			}
			else s4 = peg$FAILED;
			if (s4 !== peg$FAILED) s3 = input.substring(s3, peg$currPos);
			else s3 = s4;
			if (s3 !== peg$FAILED) s0 = peg$f6(s3);
			else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e21);
		}
		return s0;
	}
	function peg$parsecomment() {
		var s0 = peg$parsebraceComment();
		if (s0 === peg$FAILED) s0 = peg$parserestOfLineComment();
		return s0;
	}
	function peg$parsebraceComment() {
		var s0, s1, s2, s3, s4;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.charCodeAt(peg$currPos) === 123) {
			s1 = peg$c9;
			peg$currPos++;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e24);
		}
		if (s1 !== peg$FAILED) {
			s2 = peg$currPos;
			s3 = [];
			s4 = input.charAt(peg$currPos);
			if (peg$r7.test(s4)) peg$currPos++;
			else {
				s4 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e25);
			}
			while (s4 !== peg$FAILED) {
				s3.push(s4);
				s4 = input.charAt(peg$currPos);
				if (peg$r7.test(s4)) peg$currPos++;
				else {
					s4 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e25);
				}
			}
			s2 = input.substring(s2, peg$currPos);
			if (input.charCodeAt(peg$currPos) === 125) {
				s3 = peg$c10;
				peg$currPos++;
			} else {
				s3 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e26);
			}
			if (s3 !== peg$FAILED) s0 = peg$f7(s2);
			else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e23);
		}
		return s0;
	}
	function peg$parserestOfLineComment() {
		var s0, s1, s2, s3, s4;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.charCodeAt(peg$currPos) === 59) {
			s1 = peg$c11;
			peg$currPos++;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e28);
		}
		if (s1 !== peg$FAILED) {
			s2 = peg$currPos;
			s3 = [];
			s4 = input.charAt(peg$currPos);
			if (peg$r8.test(s4)) peg$currPos++;
			else {
				s4 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e29);
			}
			while (s4 !== peg$FAILED) {
				s3.push(s4);
				s4 = input.charAt(peg$currPos);
				if (peg$r8.test(s4)) peg$currPos++;
				else {
					s4 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e29);
				}
			}
			s2 = input.substring(s2, peg$currPos);
			s0 = peg$f8(s2);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e27);
		}
		return s0;
	}
	function peg$parsevariation() {
		var s0, s2, s3, s5;
		peg$silentFails++;
		s0 = peg$currPos;
		peg$parse_();
		if (input.charCodeAt(peg$currPos) === 40) {
			s2 = peg$c12;
			peg$currPos++;
		} else {
			s2 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e31);
		}
		if (s2 !== peg$FAILED) {
			s3 = peg$parseline();
			if (s3 !== peg$FAILED) {
				peg$parse_();
				if (input.charCodeAt(peg$currPos) === 41) {
					s5 = peg$c13;
					peg$currPos++;
				} else {
					s5 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e32);
				}
				if (s5 !== peg$FAILED) s0 = peg$f9(s3);
				else {
					peg$currPos = s0;
					s0 = peg$FAILED;
				}
			} else {
				peg$currPos = s0;
				s0 = peg$FAILED;
			}
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			if (peg$silentFails === 0) peg$fail(peg$e30);
		}
		return s0;
	}
	function peg$parsegameTerminationMarker() {
		var s0, s1, s3;
		peg$silentFails++;
		s0 = peg$currPos;
		if (input.substr(peg$currPos, 3) === peg$c14) {
			s1 = peg$c14;
			peg$currPos += 3;
		} else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e34);
		}
		if (s1 === peg$FAILED) {
			if (input.substr(peg$currPos, 3) === peg$c15) {
				s1 = peg$c15;
				peg$currPos += 3;
			} else {
				s1 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e35);
			}
			if (s1 === peg$FAILED) {
				if (input.substr(peg$currPos, 7) === peg$c16) {
					s1 = peg$c16;
					peg$currPos += 7;
				} else {
					s1 = peg$FAILED;
					if (peg$silentFails === 0) peg$fail(peg$e36);
				}
				if (s1 === peg$FAILED) {
					if (input.charCodeAt(peg$currPos) === 42) {
						s1 = peg$c17;
						peg$currPos++;
					} else {
						s1 = peg$FAILED;
						if (peg$silentFails === 0) peg$fail(peg$e37);
					}
				}
			}
		}
		if (s1 !== peg$FAILED) {
			peg$parse_();
			s3 = peg$parsecomment();
			if (s3 === peg$FAILED) s3 = null;
			s0 = peg$f10(s1, s3);
		} else {
			peg$currPos = s0;
			s0 = peg$FAILED;
		}
		peg$silentFails--;
		if (s0 === peg$FAILED) {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e33);
		}
		return s0;
	}
	function peg$parse_() {
		var s0, s1;
		peg$silentFails++;
		s0 = [];
		s1 = input.charAt(peg$currPos);
		if (peg$r9.test(s1)) peg$currPos++;
		else {
			s1 = peg$FAILED;
			if (peg$silentFails === 0) peg$fail(peg$e39);
		}
		while (s1 !== peg$FAILED) {
			s0.push(s1);
			s1 = input.charAt(peg$currPos);
			if (peg$r9.test(s1)) peg$currPos++;
			else {
				s1 = peg$FAILED;
				if (peg$silentFails === 0) peg$fail(peg$e39);
			}
		}
		peg$silentFails--;
		s1 = peg$FAILED;
		if (peg$silentFails === 0) peg$fail(peg$e38);
		return s0;
	}
	peg$result = peg$startRuleFunction();
	if (options.peg$library) return {
		peg$result,
		peg$currPos,
		peg$FAILED,
		peg$maxFailExpected,
		peg$maxFailPos
	};
	if (peg$result !== peg$FAILED && peg$currPos === input.length) return peg$result;
	else {
		if (peg$result !== peg$FAILED && peg$currPos < input.length) peg$fail(peg$endExpectation());
		throw peg$buildStructuredError(peg$maxFailExpected, peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null, peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos));
	}
}
/**
* @license
* Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
* All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*
* 1. Redistributions of source code must retain the above copyright notice,
*    this list of conditions and the following disclaimer.
* 2. Redistributions in binary form must reproduce the above copyright notice,
*    this list of conditions and the following disclaimer in the documentation
*    and/or other materials provided with the distribution.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.
*/
var MASK64 = 18446744073709551615n;
function rotl(x, k) {
	return (x << k | x >> 64n - k) & 18446744073709551615n;
}
function wrappingMul(x, y) {
	return x * y & MASK64;
}
function xoroshiro128(state) {
	return function() {
		let s0 = BigInt(state & MASK64);
		let s1 = BigInt(state >> 64n & MASK64);
		const result = wrappingMul(rotl(wrappingMul(s0, 5n), 7n), 9n);
		s1 ^= s0;
		s0 = (rotl(s0, 24n) ^ s1 ^ s1 << 16n) & MASK64;
		s1 = rotl(s1, 37n);
		state = s1 << 64n | s0;
		return result;
	};
}
var rand = xoroshiro128(214711438343225530594246349426526445598n);
var PIECE_KEYS = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => rand())));
var EP_KEYS = Array.from({ length: 8 }, () => rand());
var CASTLING_KEYS = Array.from({ length: 16 }, () => rand());
var SIDE_KEY = rand();
var DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var Move = class {
	color;
	from;
	to;
	piece;
	captured;
	promotion;
	/**
	* @deprecated This field is deprecated and will be removed in version 2.0.0.
	* Please use move descriptor functions instead: `isCapture`, `isPromotion`,
	* `isEnPassant`, `isKingsideCastle`, `isQueensideCastle`, `isCastle`, and
	* `isBigPawn`
	*/
	flags;
	san;
	lan;
	before;
	after;
	constructor(chess, internal) {
		const { color, piece, from, to, flags, captured, promotion } = internal;
		const fromAlgebraic = algebraic(from);
		const toAlgebraic = algebraic(to);
		this.color = color;
		this.piece = piece;
		this.from = fromAlgebraic;
		this.to = toAlgebraic;
		this.san = chess["_moveToSan"](internal, chess["_moves"]({ legal: true }));
		this.lan = fromAlgebraic + toAlgebraic;
		this.before = chess.fen();
		chess["_makeMove"](internal);
		this.after = chess.fen();
		chess["_undoMove"]();
		this.flags = "";
		for (const flag in BITS) if (BITS[flag] & flags) this.flags += FLAGS[flag];
		if (captured) this.captured = captured;
		if (promotion) {
			this.promotion = promotion;
			this.lan += promotion;
		}
	}
	isCapture() {
		return this.flags.indexOf(FLAGS["CAPTURE"]) > -1;
	}
	isPromotion() {
		return this.flags.indexOf(FLAGS["PROMOTION"]) > -1;
	}
	isEnPassant() {
		return this.flags.indexOf(FLAGS["EP_CAPTURE"]) > -1;
	}
	isKingsideCastle() {
		return this.flags.indexOf(FLAGS["KSIDE_CASTLE"]) > -1;
	}
	isQueensideCastle() {
		return this.flags.indexOf(FLAGS["QSIDE_CASTLE"]) > -1;
	}
	isBigPawn() {
		return this.flags.indexOf(FLAGS["BIG_PAWN"]) > -1;
	}
};
var EMPTY = -1;
var FLAGS = {
	NORMAL: "n",
	CAPTURE: "c",
	BIG_PAWN: "b",
	EP_CAPTURE: "e",
	PROMOTION: "p",
	KSIDE_CASTLE: "k",
	QSIDE_CASTLE: "q",
	NULL_MOVE: "-"
};
var BITS = {
	NORMAL: 1,
	CAPTURE: 2,
	BIG_PAWN: 4,
	EP_CAPTURE: 8,
	PROMOTION: 16,
	KSIDE_CASTLE: 32,
	QSIDE_CASTLE: 64,
	NULL_MOVE: 128
};
var SEVEN_TAG_ROSTER = {
	Event: "?",
	Site: "?",
	Date: "????.??.??",
	Round: "?",
	White: "?",
	Black: "?",
	Result: "*"
};
/**
* These nulls are placeholders to fix the order of tags (as they appear in PGN spec); null values will be
* eliminated in getHeaders()
*/
var SUPLEMENTAL_TAGS = {
	WhiteTitle: null,
	BlackTitle: null,
	WhiteElo: null,
	BlackElo: null,
	WhiteUSCF: null,
	BlackUSCF: null,
	WhiteNA: null,
	BlackNA: null,
	WhiteType: null,
	BlackType: null,
	EventDate: null,
	EventSponsor: null,
	Section: null,
	Stage: null,
	Board: null,
	Opening: null,
	Variation: null,
	SubVariation: null,
	ECO: null,
	NIC: null,
	Time: null,
	UTCTime: null,
	UTCDate: null,
	TimeControl: null,
	SetUp: null,
	FEN: null,
	Termination: null,
	Annotator: null,
	Mode: null,
	PlyCount: null
};
var HEADER_TEMPLATE = {
	...SEVEN_TAG_ROSTER,
	...SUPLEMENTAL_TAGS
};
var Ox88 = {
	a8: 0,
	b8: 1,
	c8: 2,
	d8: 3,
	e8: 4,
	f8: 5,
	g8: 6,
	h8: 7,
	a7: 16,
	b7: 17,
	c7: 18,
	d7: 19,
	e7: 20,
	f7: 21,
	g7: 22,
	h7: 23,
	a6: 32,
	b6: 33,
	c6: 34,
	d6: 35,
	e6: 36,
	f6: 37,
	g6: 38,
	h6: 39,
	a5: 48,
	b5: 49,
	c5: 50,
	d5: 51,
	e5: 52,
	f5: 53,
	g5: 54,
	h5: 55,
	a4: 64,
	b4: 65,
	c4: 66,
	d4: 67,
	e4: 68,
	f4: 69,
	g4: 70,
	h4: 71,
	a3: 80,
	b3: 81,
	c3: 82,
	d3: 83,
	e3: 84,
	f3: 85,
	g3: 86,
	h3: 87,
	a2: 96,
	b2: 97,
	c2: 98,
	d2: 99,
	e2: 100,
	f2: 101,
	g2: 102,
	h2: 103,
	a1: 112,
	b1: 113,
	c1: 114,
	d1: 115,
	e1: 116,
	f1: 117,
	g1: 118,
	h1: 119
};
var PAWN_OFFSETS = {
	b: [
		16,
		32,
		17,
		15
	],
	w: [
		-16,
		-32,
		-17,
		-15
	]
};
var PIECE_OFFSETS = {
	n: [
		-18,
		-33,
		-31,
		-14,
		18,
		33,
		31,
		14
	],
	b: [
		-17,
		-15,
		17,
		15
	],
	r: [
		-16,
		1,
		16,
		-1
	],
	q: [
		-17,
		-16,
		-15,
		1,
		17,
		16,
		15,
		-1
	],
	k: [
		-17,
		-16,
		-15,
		1,
		17,
		16,
		15,
		-1
	]
};
var ATTACKS = [
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	24,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	2,
	24,
	2,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	2,
	53,
	56,
	53,
	2,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	24,
	24,
	24,
	24,
	24,
	56,
	0,
	56,
	24,
	24,
	24,
	24,
	24,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	2,
	53,
	56,
	53,
	2,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	2,
	24,
	2,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	24,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	20,
	0,
	0,
	20,
	0,
	0,
	0,
	0,
	0,
	0,
	24,
	0,
	0,
	0,
	0,
	0,
	0,
	20
];
var RAYS = [
	17,
	0,
	0,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	17,
	0,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	0,
	16,
	0,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	0,
	16,
	0,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	0,
	16,
	0,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	17,
	16,
	15,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	1,
	1,
	1,
	0,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	-16,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	-16,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	-16,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	-17,
	0,
	0,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	0,
	-17,
	0,
	0,
	-15,
	0,
	0,
	0,
	0,
	0,
	0,
	-16,
	0,
	0,
	0,
	0,
	0,
	0,
	-17
];
var PIECE_MASKS = {
	p: 1,
	n: 2,
	b: 4,
	r: 8,
	q: 16,
	k: 32
};
var SYMBOLS = "pnbrqkPNBRQK";
var PROMOTIONS = [
	"n",
	"b",
	"r",
	"q"
];
var RANK_1 = 7;
var RANK_2 = 6;
var RANK_7 = 1;
var RANK_8 = 0;
var SIDES = {
	["k"]: BITS.KSIDE_CASTLE,
	["q"]: BITS.QSIDE_CASTLE
};
var ROOKS = {
	w: [{
		square: Ox88.a1,
		flag: BITS.QSIDE_CASTLE
	}, {
		square: Ox88.h1,
		flag: BITS.KSIDE_CASTLE
	}],
	b: [{
		square: Ox88.a8,
		flag: BITS.QSIDE_CASTLE
	}, {
		square: Ox88.h8,
		flag: BITS.KSIDE_CASTLE
	}]
};
var SECOND_RANK = {
	b: RANK_7,
	w: RANK_2
};
var SAN_NULLMOVE = "--";
function rank(square) {
	return square >> 4;
}
function file(square) {
	return square & 15;
}
function isDigit(c) {
	return "0123456789".indexOf(c) !== -1;
}
function algebraic(square) {
	const f = file(square);
	const r = rank(square);
	return "abcdefgh".substring(f, f + 1) + "87654321".substring(r, r + 1);
}
function swapColor(color) {
	return color === "w" ? "b" : "w";
}
function validateFen(fen) {
	const tokens = fen.split(/\s+/);
	if (tokens.length !== 6) return {
		ok: false,
		error: "Invalid FEN: must contain six space-delimited fields"
	};
	const moveNumber = parseInt(tokens[5], 10);
	if (isNaN(moveNumber) || moveNumber <= 0) return {
		ok: false,
		error: "Invalid FEN: move number must be a positive integer"
	};
	const halfMoves = parseInt(tokens[4], 10);
	if (isNaN(halfMoves) || halfMoves < 0) return {
		ok: false,
		error: "Invalid FEN: half move counter number must be a non-negative integer"
	};
	if (!/^(-|[abcdefgh][36])$/.test(tokens[3])) return {
		ok: false,
		error: "Invalid FEN: en-passant square is invalid"
	};
	if (/[^kKqQ-]/.test(tokens[2])) return {
		ok: false,
		error: "Invalid FEN: castling availability is invalid"
	};
	if (!/^(w|b)$/.test(tokens[1])) return {
		ok: false,
		error: "Invalid FEN: side-to-move is invalid"
	};
	const rows = tokens[0].split("/");
	if (rows.length !== 8) return {
		ok: false,
		error: "Invalid FEN: piece data does not contain 8 '/'-delimited rows"
	};
	for (let i = 0; i < rows.length; i++) {
		let sumFields = 0;
		let previousWasNumber = false;
		for (let k = 0; k < rows[i].length; k++) if (isDigit(rows[i][k])) {
			if (previousWasNumber) return {
				ok: false,
				error: "Invalid FEN: piece data is invalid (consecutive number)"
			};
			sumFields += parseInt(rows[i][k], 10);
			previousWasNumber = true;
		} else {
			if (!/^[prnbqkPRNBQK]$/.test(rows[i][k])) return {
				ok: false,
				error: "Invalid FEN: piece data is invalid (invalid piece)"
			};
			sumFields += 1;
			previousWasNumber = false;
		}
		if (sumFields !== 8) return {
			ok: false,
			error: "Invalid FEN: piece data is invalid (too many squares in rank)"
		};
	}
	if (tokens[3][1] == "3" && tokens[1] == "w" || tokens[3][1] == "6" && tokens[1] == "b") return {
		ok: false,
		error: "Invalid FEN: illegal en-passant square"
	};
	for (const { color, regex } of [{
		color: "white",
		regex: /K/g
	}, {
		color: "black",
		regex: /k/g
	}]) {
		if (!regex.test(tokens[0])) return {
			ok: false,
			error: `Invalid FEN: missing ${color} king`
		};
		if ((tokens[0].match(regex) || []).length > 1) return {
			ok: false,
			error: `Invalid FEN: too many ${color} kings`
		};
	}
	if (Array.from(rows[0] + rows[7]).some((char) => char.toUpperCase() === "P")) return {
		ok: false,
		error: "Invalid FEN: some pawns are on the edge rows"
	};
	return { ok: true };
}
function getDisambiguator(move, moves) {
	const from = move.from;
	const to = move.to;
	const piece = move.piece;
	let ambiguities = 0;
	let sameRank = 0;
	let sameFile = 0;
	for (let i = 0, len = moves.length; i < len; i++) {
		const ambigFrom = moves[i].from;
		const ambigTo = moves[i].to;
		if (piece === moves[i].piece && from !== ambigFrom && to === ambigTo) {
			ambiguities++;
			if (rank(from) === rank(ambigFrom)) sameRank++;
			if (file(from) === file(ambigFrom)) sameFile++;
		}
	}
	if (ambiguities > 0) {
		if (sameRank > 0 && sameFile > 0) return algebraic(from);
		else if (sameFile > 0) return algebraic(from).charAt(1);
		else return algebraic(from).charAt(0);
	}
	return "";
}
function addMove(moves, color, from, to, piece, captured = void 0, flags = BITS.NORMAL) {
	const r = rank(to);
	if (piece === "p" && (r === RANK_1 || r === RANK_8)) for (let i = 0; i < PROMOTIONS.length; i++) {
		const promotion = PROMOTIONS[i];
		moves.push({
			color,
			from,
			to,
			piece,
			captured,
			promotion,
			flags: flags | BITS.PROMOTION
		});
	}
	else moves.push({
		color,
		from,
		to,
		piece,
		captured,
		flags
	});
}
function inferPieceType(san) {
	let pieceType = san.charAt(0);
	if (pieceType >= "a" && pieceType <= "h") {
		if (san.match(/[a-h]\d.*[a-h]\d/)) return;
		return "p";
	}
	pieceType = pieceType.toLowerCase();
	if (pieceType === "o") return "k";
	return pieceType;
}
function strippedSan(move) {
	return move.replace(/=/, "").replace(/[+#]?[?!]*$/, "");
}
var Chess = class {
	_board = new Array(128);
	_turn = "w";
	_header = {};
	_kings = {
		w: EMPTY,
		b: EMPTY
	};
	_epSquare = -1;
	_halfMoves = 0;
	_moveNumber = 0;
	_history = [];
	_comments = {};
	_castling = {
		w: 0,
		b: 0
	};
	_hash = 0n;
	_positionCount = /* @__PURE__ */ new Map();
	constructor(fen = DEFAULT_POSITION, { skipValidation = false } = {}) {
		this.load(fen, { skipValidation });
	}
	clear({ preserveHeaders = false } = {}) {
		this._board = new Array(128);
		this._kings = {
			w: EMPTY,
			b: EMPTY
		};
		this._turn = "w";
		this._castling = {
			w: 0,
			b: 0
		};
		this._epSquare = EMPTY;
		this._halfMoves = 0;
		this._moveNumber = 1;
		this._history = [];
		this._comments = {};
		this._header = preserveHeaders ? this._header : { ...HEADER_TEMPLATE };
		this._hash = this._computeHash();
		this._positionCount = /* @__PURE__ */ new Map();
		this._header["SetUp"] = null;
		this._header["FEN"] = null;
	}
	load(fen, { skipValidation = false, preserveHeaders = false } = {}) {
		let tokens = fen.split(/\s+/);
		if (tokens.length >= 2 && tokens.length < 6) fen = tokens.concat([
			"-",
			"-",
			"0",
			"1"
		].slice(-(6 - tokens.length))).join(" ");
		tokens = fen.split(/\s+/);
		if (!skipValidation) {
			const { ok, error } = validateFen(fen);
			if (!ok) throw new Error(error);
		}
		const position = tokens[0];
		let square = 0;
		this.clear({ preserveHeaders });
		for (let i = 0; i < position.length; i++) {
			const piece = position.charAt(i);
			if (piece === "/") square += 8;
			else if (isDigit(piece)) square += parseInt(piece, 10);
			else {
				const color = piece < "a" ? "w" : "b";
				this._put({
					type: piece.toLowerCase(),
					color
				}, algebraic(square));
				square++;
			}
		}
		this._turn = tokens[1];
		if (tokens[2].indexOf("K") > -1) this._castling.w |= BITS.KSIDE_CASTLE;
		if (tokens[2].indexOf("Q") > -1) this._castling.w |= BITS.QSIDE_CASTLE;
		if (tokens[2].indexOf("k") > -1) this._castling.b |= BITS.KSIDE_CASTLE;
		if (tokens[2].indexOf("q") > -1) this._castling.b |= BITS.QSIDE_CASTLE;
		this._epSquare = tokens[3] === "-" ? EMPTY : Ox88[tokens[3]];
		this._halfMoves = parseInt(tokens[4], 10);
		this._moveNumber = parseInt(tokens[5], 10);
		this._hash = this._computeHash();
		this._updateSetup(fen);
		this._incPositionCount();
	}
	fen({ forceEnpassantSquare = false } = {}) {
		let empty = 0;
		let fen = "";
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (this._board[i]) {
				if (empty > 0) {
					fen += empty;
					empty = 0;
				}
				const { color, type: piece } = this._board[i];
				fen += color === "w" ? piece.toUpperCase() : piece.toLowerCase();
			} else empty++;
			if (i + 1 & 136) {
				if (empty > 0) fen += empty;
				if (i !== Ox88.h1) fen += "/";
				empty = 0;
				i += 8;
			}
		}
		let castling = "";
		if (this._castling["w"] & BITS.KSIDE_CASTLE) castling += "K";
		if (this._castling["w"] & BITS.QSIDE_CASTLE) castling += "Q";
		if (this._castling["b"] & BITS.KSIDE_CASTLE) castling += "k";
		if (this._castling["b"] & BITS.QSIDE_CASTLE) castling += "q";
		castling = castling || "-";
		let epSquare = "-";
		if (this._epSquare !== EMPTY) {
			if (forceEnpassantSquare) epSquare = algebraic(this._epSquare);
			else {
				const bigPawnSquare = this._epSquare + (this._turn === "w" ? 16 : -16);
				const squares = [bigPawnSquare + 1, bigPawnSquare - 1];
				for (const square of squares) {
					if (square & 136) continue;
					const color = this._turn;
					if (this._board[square]?.color === color && this._board[square]?.type === "p") {
						this._makeMove({
							color,
							from: square,
							to: this._epSquare,
							piece: "p",
							captured: "p",
							flags: BITS.EP_CAPTURE
						});
						const isLegal = !this._isKingAttacked(color);
						this._undoMove();
						if (isLegal) {
							epSquare = algebraic(this._epSquare);
							break;
						}
					}
				}
			}
		}
		return [
			fen,
			this._turn,
			castling,
			epSquare,
			this._halfMoves,
			this._moveNumber
		].join(" ");
	}
	_pieceKey(i) {
		if (!this._board[i]) return 0n;
		const { color, type } = this._board[i];
		const colorIndex = {
			w: 0,
			b: 1
		}[color];
		const typeIndex = {
			p: 0,
			n: 1,
			b: 2,
			r: 3,
			q: 4,
			k: 5
		}[type];
		return PIECE_KEYS[colorIndex][typeIndex][i];
	}
	_epKey() {
		return this._epSquare === EMPTY ? 0n : EP_KEYS[this._epSquare & 7];
	}
	_castlingKey() {
		return CASTLING_KEYS[this._castling.w >> 5 | this._castling.b >> 3];
	}
	_computeHash() {
		let hash = 0n;
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (this._board[i]) hash ^= this._pieceKey(i);
		}
		hash ^= this._epKey();
		hash ^= this._castlingKey();
		if (this._turn === "b") hash ^= SIDE_KEY;
		return hash;
	}
	_updateSetup(fen) {
		if (this._history.length > 0) return;
		if (fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			this._header["SetUp"] = "1";
			this._header["FEN"] = fen;
		} else {
			this._header["SetUp"] = null;
			this._header["FEN"] = null;
		}
	}
	reset() {
		this.load(DEFAULT_POSITION);
	}
	get(square) {
		return this._board[Ox88[square]];
	}
	findPiece(piece) {
		const squares = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (!this._board[i] || this._board[i]?.color !== piece.color) continue;
			if (this._board[i].color === piece.color && this._board[i].type === piece.type) squares.push(algebraic(i));
		}
		return squares;
	}
	put({ type, color }, square) {
		if (this._put({
			type,
			color
		}, square)) {
			this._updateCastlingRights();
			this._updateEnPassantSquare();
			this._updateSetup(this.fen());
			return true;
		}
		return false;
	}
	_set(sq, piece) {
		this._hash ^= this._pieceKey(sq);
		this._board[sq] = piece;
		this._hash ^= this._pieceKey(sq);
	}
	_put({ type, color }, square) {
		if (SYMBOLS.indexOf(type.toLowerCase()) === -1) return false;
		if (!(square in Ox88)) return false;
		const sq = Ox88[square];
		if (type == "k" && !(this._kings[color] == EMPTY || this._kings[color] == sq)) return false;
		const currentPieceOnSquare = this._board[sq];
		if (currentPieceOnSquare && currentPieceOnSquare.type === "k") this._kings[currentPieceOnSquare.color] = EMPTY;
		this._set(sq, {
			type,
			color
		});
		if (type === "k") this._kings[color] = sq;
		return true;
	}
	_clear(sq) {
		this._hash ^= this._pieceKey(sq);
		delete this._board[sq];
	}
	remove(square) {
		const piece = this.get(square);
		this._clear(Ox88[square]);
		if (piece && piece.type === "k") this._kings[piece.color] = EMPTY;
		this._updateCastlingRights();
		this._updateEnPassantSquare();
		this._updateSetup(this.fen());
		return piece;
	}
	_updateCastlingRights() {
		this._hash ^= this._castlingKey();
		const whiteKingInPlace = this._board[Ox88.e1]?.type === "k" && this._board[Ox88.e1]?.color === "w";
		const blackKingInPlace = this._board[Ox88.e8]?.type === "k" && this._board[Ox88.e8]?.color === "b";
		if (!whiteKingInPlace || this._board[Ox88.a1]?.type !== "r" || this._board[Ox88.a1]?.color !== "w") this._castling.w &= -65;
		if (!whiteKingInPlace || this._board[Ox88.h1]?.type !== "r" || this._board[Ox88.h1]?.color !== "w") this._castling.w &= -33;
		if (!blackKingInPlace || this._board[Ox88.a8]?.type !== "r" || this._board[Ox88.a8]?.color !== "b") this._castling.b &= -65;
		if (!blackKingInPlace || this._board[Ox88.h8]?.type !== "r" || this._board[Ox88.h8]?.color !== "b") this._castling.b &= -33;
		this._hash ^= this._castlingKey();
	}
	_updateEnPassantSquare() {
		if (this._epSquare === EMPTY) return;
		const startSquare = this._epSquare + (this._turn === "w" ? -16 : 16);
		const currentSquare = this._epSquare + (this._turn === "w" ? 16 : -16);
		const attackers = [currentSquare + 1, currentSquare - 1];
		if (this._board[startSquare] !== null || this._board[this._epSquare] !== null || this._board[currentSquare]?.color !== swapColor(this._turn) || this._board[currentSquare]?.type !== "p") {
			this._hash ^= this._epKey();
			this._epSquare = EMPTY;
			return;
		}
		const canCapture = (square) => !(square & 136) && this._board[square]?.color === this._turn && this._board[square]?.type === "p";
		if (!attackers.some(canCapture)) {
			this._hash ^= this._epKey();
			this._epSquare = EMPTY;
		}
	}
	_attacked(color, square, verbose) {
		const attackers = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (i & 136) {
				i += 7;
				continue;
			}
			if (this._board[i] === void 0 || this._board[i].color !== color) continue;
			const piece = this._board[i];
			const difference = i - square;
			if (difference === 0) continue;
			const index = difference + 119;
			if (ATTACKS[index] & PIECE_MASKS[piece.type]) {
				if (piece.type === "p") {
					if (difference > 0 && piece.color === "w" || difference <= 0 && piece.color === "b") {
						if (!verbose) return true;
						else attackers.push(algebraic(i));
					}
					continue;
				}
				if (piece.type === "n" || piece.type === "k") {
					if (!verbose) return true;
					else {
						attackers.push(algebraic(i));
						continue;
					}
				}
				const offset = RAYS[index];
				let j = i + offset;
				let blocked = false;
				while (j !== square) {
					if (this._board[j] != null) {
						blocked = true;
						break;
					}
					j += offset;
				}
				if (!blocked) {
					if (!verbose) return true;
					else {
						attackers.push(algebraic(i));
						continue;
					}
				}
			}
		}
		if (verbose) return attackers;
		else return false;
	}
	attackers(square, attackedBy) {
		if (!attackedBy) return this._attacked(this._turn, Ox88[square], true);
		else return this._attacked(attackedBy, Ox88[square], true);
	}
	_isKingAttacked(color) {
		const square = this._kings[color];
		return square === -1 ? false : this._attacked(swapColor(color), square);
	}
	hash() {
		return this._hash.toString(16);
	}
	isAttacked(square, attackedBy) {
		return this._attacked(attackedBy, Ox88[square]);
	}
	isCheck() {
		return this._isKingAttacked(this._turn);
	}
	inCheck() {
		return this.isCheck();
	}
	isCheckmate() {
		return this.isCheck() && this._moves().length === 0;
	}
	isStalemate() {
		return !this.isCheck() && this._moves().length === 0;
	}
	isInsufficientMaterial() {
		const pieces = {
			b: 0,
			n: 0,
			r: 0,
			q: 0,
			k: 0,
			p: 0
		};
		const bishops = [];
		let numPieces = 0;
		let squareColor = 0;
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			squareColor = (squareColor + 1) % 2;
			if (i & 136) {
				i += 7;
				continue;
			}
			const piece = this._board[i];
			if (piece) {
				pieces[piece.type] = piece.type in pieces ? pieces[piece.type] + 1 : 1;
				if (piece.type === "b") bishops.push(squareColor);
				numPieces++;
			}
		}
		if (numPieces === 2) return true;
		else if (numPieces === 3 && (pieces["b"] === 1 || pieces["n"] === 1)) return true;
		else if (numPieces === pieces["b"] + 2) {
			let sum = 0;
			const len = bishops.length;
			for (let i = 0; i < len; i++) sum += bishops[i];
			if (sum === 0 || sum === len) return true;
		}
		return false;
	}
	isThreefoldRepetition() {
		return this._getPositionCount(this._hash) >= 3;
	}
	isDrawByFiftyMoves() {
		return this._halfMoves >= 100;
	}
	isDraw() {
		return this.isDrawByFiftyMoves() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition();
	}
	isGameOver() {
		return this.isCheckmate() || this.isDraw();
	}
	moves({ verbose = false, square = void 0, piece = void 0 } = {}) {
		const moves = this._moves({
			square,
			piece
		});
		if (verbose) return moves.map((move) => new Move(this, move));
		else return moves.map((move) => this._moveToSan(move, moves));
	}
	_moves({ legal = true, piece = void 0, square = void 0 } = {}) {
		const forSquare = square ? square.toLowerCase() : void 0;
		const forPiece = piece?.toLowerCase();
		const moves = [];
		const us = this._turn;
		const them = swapColor(us);
		let firstSquare = Ox88.a8;
		let lastSquare = Ox88.h1;
		let singleSquare = false;
		if (forSquare) {
			if (!(forSquare in Ox88)) return [];
			else {
				firstSquare = lastSquare = Ox88[forSquare];
				singleSquare = true;
			}
		}
		for (let from = firstSquare; from <= lastSquare; from++) {
			if (from & 136) {
				from += 7;
				continue;
			}
			if (!this._board[from] || this._board[from].color === them) continue;
			const { type } = this._board[from];
			let to;
			if (type === "p") {
				if (forPiece && forPiece !== type) continue;
				to = from + PAWN_OFFSETS[us][0];
				if (!this._board[to]) {
					addMove(moves, us, from, to, "p");
					to = from + PAWN_OFFSETS[us][1];
					if (SECOND_RANK[us] === rank(from) && !this._board[to]) addMove(moves, us, from, to, "p", void 0, BITS.BIG_PAWN);
				}
				for (let j = 2; j < 4; j++) {
					to = from + PAWN_OFFSETS[us][j];
					if (to & 136) continue;
					if (this._board[to]?.color === them) addMove(moves, us, from, to, "p", this._board[to].type, BITS.CAPTURE);
					else if (to === this._epSquare) addMove(moves, us, from, to, "p", "p", BITS.EP_CAPTURE);
				}
			} else {
				if (forPiece && forPiece !== type) continue;
				for (let j = 0, len = PIECE_OFFSETS[type].length; j < len; j++) {
					const offset = PIECE_OFFSETS[type][j];
					to = from;
					while (true) {
						to += offset;
						if (to & 136) break;
						if (!this._board[to]) addMove(moves, us, from, to, type);
						else {
							if (this._board[to].color === us) break;
							addMove(moves, us, from, to, type, this._board[to].type, BITS.CAPTURE);
							break;
						}
						if (type === "n" || type === "k") break;
					}
				}
			}
		}
		if (forPiece === void 0 || forPiece === "k") {
			if (!singleSquare || lastSquare === this._kings[us]) {
				if (this._castling[us] & BITS.KSIDE_CASTLE) {
					const castlingFrom = this._kings[us];
					const castlingTo = castlingFrom + 2;
					if (!this._board[castlingFrom + 1] && !this._board[castlingTo] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom + 1) && !this._attacked(them, castlingTo)) addMove(moves, us, this._kings[us], castlingTo, "k", void 0, BITS.KSIDE_CASTLE);
				}
				if (this._castling[us] & BITS.QSIDE_CASTLE) {
					const castlingFrom = this._kings[us];
					const castlingTo = castlingFrom - 2;
					if (!this._board[castlingFrom - 1] && !this._board[castlingFrom - 2] && !this._board[castlingFrom - 3] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom - 1) && !this._attacked(them, castlingTo)) addMove(moves, us, this._kings[us], castlingTo, "k", void 0, BITS.QSIDE_CASTLE);
				}
			}
		}
		if (!legal || this._kings[us] === -1) return moves;
		const legalMoves = [];
		for (let i = 0, len = moves.length; i < len; i++) {
			this._makeMove(moves[i]);
			if (!this._isKingAttacked(us)) legalMoves.push(moves[i]);
			this._undoMove();
		}
		return legalMoves;
	}
	move(move, { strict = false } = {}) {
		let moveObj = null;
		if (typeof move === "string") moveObj = this._moveFromSan(move, strict);
		else if (move === null) moveObj = this._moveFromSan(SAN_NULLMOVE, strict);
		else if (typeof move === "object") {
			const moves = this._moves();
			for (let i = 0, len = moves.length; i < len; i++) if (move.from === algebraic(moves[i].from) && move.to === algebraic(moves[i].to) && (!("promotion" in moves[i]) || move.promotion === moves[i].promotion)) {
				moveObj = moves[i];
				break;
			}
		}
		if (!moveObj) {
			if (typeof move === "string") throw new Error(`Invalid move: ${move}`);
			else throw new Error(`Invalid move: ${JSON.stringify(move)}`);
		}
		if (this.isCheck() && moveObj.flags & BITS.NULL_MOVE) throw new Error("Null move not allowed when in check");
		const prettyMove = new Move(this, moveObj);
		this._makeMove(moveObj);
		this._incPositionCount();
		return prettyMove;
	}
	_push(move) {
		this._history.push({
			move,
			kings: {
				b: this._kings.b,
				w: this._kings.w
			},
			turn: this._turn,
			castling: {
				b: this._castling.b,
				w: this._castling.w
			},
			epSquare: this._epSquare,
			halfMoves: this._halfMoves,
			moveNumber: this._moveNumber
		});
	}
	_movePiece(from, to) {
		this._hash ^= this._pieceKey(from);
		this._board[to] = this._board[from];
		delete this._board[from];
		this._hash ^= this._pieceKey(to);
	}
	_makeMove(move) {
		const us = this._turn;
		const them = swapColor(us);
		this._push(move);
		if (move.flags & BITS.NULL_MOVE) {
			if (us === "b") this._moveNumber++;
			this._halfMoves++;
			this._turn = them;
			this._epSquare = EMPTY;
			return;
		}
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		if (move.captured) this._hash ^= this._pieceKey(move.to);
		this._movePiece(move.from, move.to);
		if (move.flags & BITS.EP_CAPTURE) {
			if (this._turn === "b") this._clear(move.to - 16);
			else this._clear(move.to + 16);
		}
		if (move.promotion) {
			this._clear(move.to);
			this._set(move.to, {
				type: move.promotion,
				color: us
			});
		}
		if (this._board[move.to].type === "k") {
			this._kings[us] = move.to;
			if (move.flags & BITS.KSIDE_CASTLE) {
				const castlingTo = move.to - 1;
				const castlingFrom = move.to + 1;
				this._movePiece(castlingFrom, castlingTo);
			} else if (move.flags & BITS.QSIDE_CASTLE) {
				const castlingTo = move.to + 1;
				const castlingFrom = move.to - 2;
				this._movePiece(castlingFrom, castlingTo);
			}
			this._castling[us] = 0;
		}
		if (this._castling[us]) {
			for (let i = 0, len = ROOKS[us].length; i < len; i++) if (move.from === ROOKS[us][i].square && this._castling[us] & ROOKS[us][i].flag) {
				this._castling[us] ^= ROOKS[us][i].flag;
				break;
			}
		}
		if (this._castling[them]) {
			for (let i = 0, len = ROOKS[them].length; i < len; i++) if (move.to === ROOKS[them][i].square && this._castling[them] & ROOKS[them][i].flag) {
				this._castling[them] ^= ROOKS[them][i].flag;
				break;
			}
		}
		this._hash ^= this._castlingKey();
		if (move.flags & BITS.BIG_PAWN) {
			let epSquare;
			if (us === "b") epSquare = move.to - 16;
			else epSquare = move.to + 16;
			if (!(move.to - 1 & 136) && this._board[move.to - 1]?.type === "p" && this._board[move.to - 1]?.color === them || !(move.to + 1 & 136) && this._board[move.to + 1]?.type === "p" && this._board[move.to + 1]?.color === them) {
				this._epSquare = epSquare;
				this._hash ^= this._epKey();
			} else this._epSquare = EMPTY;
		} else this._epSquare = EMPTY;
		if (move.piece === "p") this._halfMoves = 0;
		else if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) this._halfMoves = 0;
		else this._halfMoves++;
		if (us === "b") this._moveNumber++;
		this._turn = them;
		this._hash ^= SIDE_KEY;
	}
	undo() {
		const hash = this._hash;
		const move = this._undoMove();
		if (move) {
			const prettyMove = new Move(this, move);
			this._decPositionCount(hash);
			return prettyMove;
		}
		return null;
	}
	_undoMove() {
		const old = this._history.pop();
		if (old === void 0) return null;
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		const move = old.move;
		this._kings = old.kings;
		this._turn = old.turn;
		this._castling = old.castling;
		this._epSquare = old.epSquare;
		this._halfMoves = old.halfMoves;
		this._moveNumber = old.moveNumber;
		this._hash ^= this._epKey();
		this._hash ^= this._castlingKey();
		this._hash ^= SIDE_KEY;
		const us = this._turn;
		const them = swapColor(us);
		if (move.flags & BITS.NULL_MOVE) return move;
		this._movePiece(move.to, move.from);
		if (move.piece) {
			this._clear(move.from);
			this._set(move.from, {
				type: move.piece,
				color: us
			});
		}
		if (move.captured) {
			if (move.flags & BITS.EP_CAPTURE) {
				let index;
				if (us === "b") index = move.to - 16;
				else index = move.to + 16;
				this._set(index, {
					type: "p",
					color: them
				});
			} else this._set(move.to, {
				type: move.captured,
				color: them
			});
		}
		if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
			let castlingTo, castlingFrom;
			if (move.flags & BITS.KSIDE_CASTLE) {
				castlingTo = move.to + 1;
				castlingFrom = move.to - 1;
			} else {
				castlingTo = move.to - 2;
				castlingFrom = move.to + 1;
			}
			this._movePiece(castlingFrom, castlingTo);
		}
		return move;
	}
	pgn({ newline = "\n", maxWidth = 0 } = {}) {
		const result = [];
		let headerExists = false;
		for (const i in this._header) {
			if (this._header[i]) result.push(`[${i} "${this._header[i]}"]` + newline);
			headerExists = true;
		}
		if (headerExists && this._history.length) result.push(newline);
		const appendComment = (moveString) => {
			const comment = this._comments[this.fen()];
			if (typeof comment !== "undefined") {
				const delimiter = moveString.length > 0 ? " " : "";
				moveString = `${moveString}${delimiter}{${comment}}`;
			}
			return moveString;
		};
		const reversedHistory = [];
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		const moves = [];
		let moveString = "";
		if (reversedHistory.length === 0) moves.push(appendComment(""));
		while (reversedHistory.length > 0) {
			moveString = appendComment(moveString);
			const move = reversedHistory.pop();
			if (!move) break;
			if (!this._history.length && move.color === "b") {
				const prefix = `${this._moveNumber}. ...`;
				moveString = moveString ? `${moveString} ${prefix}` : prefix;
			} else if (move.color === "w") {
				if (moveString.length) moves.push(moveString);
				moveString = this._moveNumber + ".";
			}
			moveString = moveString + " " + this._moveToSan(move, this._moves({ legal: true }));
			this._makeMove(move);
		}
		if (moveString.length) moves.push(appendComment(moveString));
		moves.push(this._header.Result || "*");
		if (maxWidth === 0) return result.join("") + moves.join(" ");
		const strip = function() {
			if (result.length > 0 && result[result.length - 1] === " ") {
				result.pop();
				return true;
			}
			return false;
		};
		const wrapComment = function(width, move) {
			for (const token of move.split(" ")) {
				if (!token) continue;
				if (width + token.length > maxWidth) {
					while (strip()) width--;
					result.push(newline);
					width = 0;
				}
				result.push(token);
				width += token.length;
				result.push(" ");
				width++;
			}
			if (strip()) width--;
			return width;
		};
		let currentWidth = 0;
		for (let i = 0; i < moves.length; i++) {
			if (currentWidth + moves[i].length > maxWidth) {
				if (moves[i].includes("{")) {
					currentWidth = wrapComment(currentWidth, moves[i]);
					continue;
				}
			}
			if (currentWidth + moves[i].length > maxWidth && i !== 0) {
				if (result[result.length - 1] === " ") result.pop();
				result.push(newline);
				currentWidth = 0;
			} else if (i !== 0) {
				result.push(" ");
				currentWidth++;
			}
			result.push(moves[i]);
			currentWidth += moves[i].length;
		}
		return result.join("");
	}
	/**
	* @deprecated Use `setHeader` and `getHeaders` instead. This method will return null header tags (which is not what you want)
	*/
	header(...args) {
		for (let i = 0; i < args.length; i += 2) if (typeof args[i] === "string" && typeof args[i + 1] === "string") this._header[args[i]] = args[i + 1];
		return this._header;
	}
	setHeader(key, value) {
		this._header[key] = value ?? SEVEN_TAG_ROSTER[key] ?? null;
		return this.getHeaders();
	}
	removeHeader(key) {
		if (key in this._header) {
			this._header[key] = SEVEN_TAG_ROSTER[key] || null;
			return true;
		}
		return false;
	}
	getHeaders() {
		const nonNullHeaders = {};
		for (const [key, value] of Object.entries(this._header)) if (value !== null) nonNullHeaders[key] = value;
		return nonNullHeaders;
	}
	loadPgn(pgn, { strict = false, newlineChar = "\r?\n" } = {}) {
		if (newlineChar !== "\r?\n") pgn = pgn.replace(new RegExp(newlineChar, "g"), "\n");
		const parsedPgn = peg$parse(pgn);
		this.reset();
		const headers = parsedPgn.headers;
		let fen = "";
		for (const key in headers) {
			if (key.toLowerCase() === "fen") fen = headers[key];
			this.header(key, headers[key]);
		}
		if (!strict) {
			if (fen) this.load(fen, { preserveHeaders: true });
		} else if (headers["SetUp"] === "1") {
			if (!("FEN" in headers)) throw new Error("Invalid PGN: FEN tag must be supplied with SetUp tag");
			this.load(headers["FEN"], { preserveHeaders: true });
		}
		let node = parsedPgn.root;
		while (node) {
			if (node.move) {
				const move = this._moveFromSan(node.move, strict);
				if (move == null) throw new Error(`Invalid move in PGN: ${node.move}`);
				else {
					this._makeMove(move);
					this._incPositionCount();
				}
			}
			if (node.comment !== void 0) this._comments[this.fen()] = node.comment;
			node = node.variations[0];
		}
		const result = parsedPgn.result;
		if (result && Object.keys(this._header).length && this._header["Result"] !== result) this.setHeader("Result", result);
	}
	_moveToSan(move, moves) {
		let output = "";
		if (move.flags & BITS.KSIDE_CASTLE) output = "O-O";
		else if (move.flags & BITS.QSIDE_CASTLE) output = "O-O-O";
		else if (move.flags & BITS.NULL_MOVE) return SAN_NULLMOVE;
		else {
			if (move.piece !== "p") {
				const disambiguator = getDisambiguator(move, moves);
				output += move.piece.toUpperCase() + disambiguator;
			}
			if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
				if (move.piece === "p") output += algebraic(move.from)[0];
				output += "x";
			}
			output += algebraic(move.to);
			if (move.promotion) output += "=" + move.promotion.toUpperCase();
		}
		this._makeMove(move);
		if (this.isCheck()) {
			if (this.isCheckmate()) output += "#";
			else output += "+";
		}
		this._undoMove();
		return output;
	}
	_moveFromSan(move, strict = false) {
		let cleanMove = strippedSan(move);
		if (!strict) {
			if (cleanMove === "0-0") cleanMove = "O-O";
			else if (cleanMove === "0-0-0") cleanMove = "O-O-O";
		}
		if (cleanMove == SAN_NULLMOVE) return {
			color: this._turn,
			from: 0,
			to: 0,
			piece: "k",
			flags: BITS.NULL_MOVE
		};
		let pieceType = inferPieceType(cleanMove);
		let moves = this._moves({
			legal: true,
			piece: pieceType
		});
		for (let i = 0, len = moves.length; i < len; i++) if (cleanMove === strippedSan(this._moveToSan(moves[i], moves))) return moves[i];
		if (strict) return null;
		let piece = void 0;
		let matches = void 0;
		let from = void 0;
		let to = void 0;
		let promotion = void 0;
		let overlyDisambiguated = false;
		matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
		if (matches) {
			piece = matches[1];
			from = matches[2];
			to = matches[3];
			promotion = matches[4];
			if (from.length == 1) overlyDisambiguated = true;
		} else {
			matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/);
			if (matches) {
				piece = matches[1];
				from = matches[2];
				to = matches[3];
				promotion = matches[4];
				if (from.length == 1) overlyDisambiguated = true;
			}
		}
		pieceType = inferPieceType(cleanMove);
		moves = this._moves({
			legal: true,
			piece: piece ? piece : pieceType
		});
		if (!to) return null;
		for (let i = 0, len = moves.length; i < len; i++) if (!from) {
			if (cleanMove === strippedSan(this._moveToSan(moves[i], moves)).replace("x", "")) return moves[i];
		} else if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[from] == moves[i].from && Ox88[to] == moves[i].to && (!promotion || promotion.toLowerCase() == moves[i].promotion)) return moves[i];
		else if (overlyDisambiguated) {
			const square = algebraic(moves[i].from);
			if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[to] == moves[i].to && (from == square[0] || from == square[1]) && (!promotion || promotion.toLowerCase() == moves[i].promotion)) return moves[i];
		}
		return null;
	}
	ascii() {
		let s = "   +------------------------+\n";
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (file(i) === 0) s += " " + "87654321"[rank(i)] + " |";
			if (this._board[i]) {
				const piece = this._board[i].type;
				const symbol = this._board[i].color === "w" ? piece.toUpperCase() : piece.toLowerCase();
				s += " " + symbol + " ";
			} else s += " . ";
			if (i + 1 & 136) {
				s += "|\n";
				i += 8;
			}
		}
		s += "   +------------------------+\n";
		s += "     a  b  c  d  e  f  g  h";
		return s;
	}
	perft(depth) {
		const moves = this._moves({ legal: false });
		let nodes = 0;
		const color = this._turn;
		for (let i = 0, len = moves.length; i < len; i++) {
			this._makeMove(moves[i]);
			if (!this._isKingAttacked(color)) {
				if (depth - 1 > 0) nodes += this.perft(depth - 1);
				else nodes++;
			}
			this._undoMove();
		}
		return nodes;
	}
	setTurn(color) {
		if (this._turn == color) return false;
		this.move("--");
		return true;
	}
	turn() {
		return this._turn;
	}
	board() {
		const output = [];
		let row = [];
		for (let i = Ox88.a8; i <= Ox88.h1; i++) {
			if (this._board[i] == null) row.push(null);
			else row.push({
				square: algebraic(i),
				type: this._board[i].type,
				color: this._board[i].color
			});
			if (i + 1 & 136) {
				output.push(row);
				row = [];
				i += 8;
			}
		}
		return output;
	}
	squareColor(square) {
		if (square in Ox88) {
			const sq = Ox88[square];
			return (rank(sq) + file(sq)) % 2 === 0 ? "light" : "dark";
		}
		return null;
	}
	history({ verbose = false } = {}) {
		const reversedHistory = [];
		const moveHistory = [];
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		while (true) {
			const move = reversedHistory.pop();
			if (!move) break;
			if (verbose) moveHistory.push(new Move(this, move));
			else moveHistory.push(this._moveToSan(move, this._moves()));
			this._makeMove(move);
		}
		return moveHistory;
	}
	_getPositionCount(hash) {
		return this._positionCount.get(hash) ?? 0;
	}
	_incPositionCount() {
		this._positionCount.set(this._hash, (this._positionCount.get(this._hash) ?? 0) + 1);
	}
	_decPositionCount(hash) {
		const currentCount = this._positionCount.get(hash) ?? 0;
		if (currentCount === 1) this._positionCount.delete(hash);
		else this._positionCount.set(hash, currentCount - 1);
	}
	_pruneComments() {
		const reversedHistory = [];
		const currentComments = {};
		const copyComment = (fen) => {
			if (fen in this._comments) currentComments[fen] = this._comments[fen];
		};
		while (this._history.length > 0) reversedHistory.push(this._undoMove());
		copyComment(this.fen());
		while (true) {
			const move = reversedHistory.pop();
			if (!move) break;
			this._makeMove(move);
			copyComment(this.fen());
		}
		this._comments = currentComments;
	}
	getComment() {
		return this._comments[this.fen()];
	}
	setComment(comment) {
		this._comments[this.fen()] = comment.replace("{", "[").replace("}", "]");
	}
	/**
	* @deprecated Renamed to `removeComment` for consistency
	*/
	deleteComment() {
		return this.removeComment();
	}
	removeComment() {
		const comment = this._comments[this.fen()];
		delete this._comments[this.fen()];
		return comment;
	}
	getComments() {
		this._pruneComments();
		return Object.keys(this._comments).map((fen) => {
			return {
				fen,
				comment: this._comments[fen]
			};
		});
	}
	/**
	* @deprecated Renamed to `removeComments` for consistency
	*/
	deleteComments() {
		return this.removeComments();
	}
	removeComments() {
		this._pruneComments();
		return Object.keys(this._comments).map((fen) => {
			const comment = this._comments[fen];
			delete this._comments[fen];
			return {
				fen,
				comment
			};
		});
	}
	setCastlingRights(color, rights) {
		for (const side of ["k", "q"]) if (rights[side] !== void 0) {
			if (rights[side]) this._castling[color] |= SIDES[side];
			else this._castling[color] &= ~SIDES[side];
		}
		this._updateCastlingRights();
		const result = this.getCastlingRights(color);
		return (rights["k"] === void 0 || rights["k"] === result["k"]) && (rights["q"] === void 0 || rights["q"] === result["q"]);
	}
	getCastlingRights(color) {
		return {
			["k"]: (this._castling[color] & SIDES["k"]) !== 0,
			["q"]: (this._castling[color] & SIDES["q"]) !== 0
		};
	}
	moveNumber() {
		return this._moveNumber;
	}
};
// src/shared/game.ts
var CONTROLS = [
	{
		minutes: 3,
		increment: 2
	},
	{
		minutes: 5,
		increment: 0
	},
	{
		minutes: 10,
		increment: 0
	},
	{
		minutes: 15,
		increment: 10
	}
];
var CHALLENGE_WINDOW_MS = 3e4;
var GameError = class extends Error {};
function chessFor(game) {
	const chess = new Chess();
	if (game.pgn) chess.loadPgn(game.pgn);
	return chess;
}
function seatFor(game, id) {
	return game.white?.id === id ? "w" : game.black?.id === id ? "b" : null;
}
function remaining(game, color, now) {
	const ticking = game.status === "playing" && game.fen.split(" ")[1] === color;
	return Math.max(0, (color === "w" ? game.whiteMs : game.blackMs) - (ticking ? Math.max(0, now - game.tickAt) : 0));
}
function finish(game, result, reason, now) {
	return {
		...game,
		whiteMs: remaining(game, "w", now),
		blackMs: remaining(game, "b", now),
		status: "finished",
		result,
		reason,
		drawOffer: null,
		tickAt: now
	};
}
function settleClock(game, now) {
	if (game.status !== "playing") return game;
	const turn = game.fen.split(" ")[1];
	if (remaining(game, turn, now) > 0) return game;
	const other = turn === "w" ? "b" : "w";
	const hasMaterial = new Chess(game.fen).board().flat().some((p) => p?.color === other && p.type !== "k");
	return finish(game, hasMaterial ? turn === "w" ? "0-1" : "1-0" : "½-½", hasMaterial ? "Se acabó el tiempo" : "Material insuficiente", now);
}
function moveGame(game, actor, from, to, promotion, now) {
	const settled = settleClock(game, now);
	if (settled !== game) return settled;
	if (game.status !== "playing") throw new GameError("La partida no está en juego.");
	const chess = chessFor(game);
	const seat = seatFor(game, actor);
	if (!seat || seat !== chess.turn()) throw new GameError("Espera tu turno.");
	if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || promotion && !/^[qrbn]$/.test(promotion)) throw new GameError("Jugada no válida.");
	try {
		chess.move({
			from,
			to,
			promotion
		});
	} catch {
		throw new GameError("Esa jugada no es legal.");
	}
	let next = {
		...game,
		pgn: chess.pgn(),
		fen: chess.fen(),
		moves: chess.history(),
		tickAt: now,
		drawOffer: null,
		whiteMs: remaining(game, "w", now) + (seat === "w" ? game.increment * 1e3 : 0),
		blackMs: remaining(game, "b", now) + (seat === "b" ? game.increment * 1e3 : 0)
	};
	if (chess.isCheckmate()) next = finish(next, seat === "w" ? "1-0" : "0-1", "Jaque mate", now);
	else if (chess.isDraw()) next = finish(next, "½-½", chess.isStalemate() ? "Rey ahogado" : chess.isThreefoldRepetition() ? "Triple repetición" : chess.isInsufficientMaterial() ? "Material insuficiente" : "Regla de las cincuenta jugadas", now);
	return next;
}
function newGame(player, options, now) {
	if (!CONTROLS.some((c) => c.minutes === options.minutes && c.increment === options.increment)) throw new GameError("Elige un ritmo de juego.");
	return {
		id: crypto.randomUUID(),
		code: Array.from(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(8)), (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 29]).join(""),
		revision: 0,
		public: options.public,
		status: "waiting",
		white: options.color === "w" ? player : null,
		black: options.color === "b" ? player : null,
		pgn: "",
		fen: new Chess().fen(),
		moves: [],
		minutes: options.minutes,
		increment: options.increment,
		whiteMs: options.minutes * 6e4,
		blackMs: options.minutes * 6e4,
		tickAt: now,
		createdAt: now,
		result: null,
		reason: null,
		drawOffer: null
	};
}
function joinGame(game, player, now) {
	if (seatFor(game, player.id)) return game;
	if (game.status !== "waiting") throw new GameError("Esta partida ya tiene dos jugadores.");
	return {
		...game,
		white: game.white ?? player,
		black: game.black ?? player,
		status: "playing",
		tickAt: now
	};
}
function publicGame(game, id, now) {
	return {
		id: game.id,
		revision: game.revision,
		public: game.public,
		status: game.status,
		pgn: game.pgn,
		fen: game.fen,
		moves: game.moves,
		minutes: game.minutes,
		increment: game.increment,
		whiteMs: game.whiteMs,
		blackMs: game.blackMs,
		tickAt: game.tickAt,
		createdAt: game.createdAt,
		result: game.result,
		reason: game.reason,
		drawOffer: game.drawOffer,
		white: game.white && { name: game.white.name },
		black: game.black && { name: game.black.name },
		seat: seatFor(game, id),
		serverNow: now
	};
}
function newChallenge(from, to, options, now) {
	if (!CONTROLS.some((c) => c.minutes === options.minutes && c.increment === options.increment)) throw new GameError("Elige un ritmo de juego.");
	if (![
		"w",
		"b",
		"random"
	].includes(options.color)) throw new GameError("Elige un color.");
	return {
		id: crypto.randomUUID(),
		from,
		to,
		minutes: options.minutes,
		increment: options.increment,
		color: options.color,
		status: "pending",
		gameId: null,
		createdAt: now,
		expiresAt: now + CHALLENGE_WINDOW_MS,
		ack: 0
	};
}
function challengeView(challenge, side) {
	const opponent = side === "from" ? challenge.to : challenge.from;
	return {
		id: challenge.id,
		opponent: opponent.name,
		minutes: challenge.minutes,
		increment: challenge.increment,
		color: side === "from" || challenge.color === "random" ? challenge.color : challenge.color === "w" ? "b" : "w",
		status: challenge.status,
		gameId: challenge.gameId,
		expiresAt: challenge.expiresAt
	};
}
function actorFor(game, player) {
	for (const member of [game.white, game.black]) if (member && (member.sub ? member.sub === player.sub : member.id === player.id)) return member.id;
	return "";
}
// freebuff-realtime/server.js
function hub(env) {
	if (!env.REALTIME) throw new Error("Enable realtime in the Sites deploy manifest and configure the local REALTIME binding.");
	return env.REALTIME.get(env.REALTIME.idFromName("hub"));
}
async function call(env, path, body) {
	const response = await hub(env).fetch(new Request("https://realtime" + path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	}));
	if (!response.ok) throw new Error("Realtime request failed (" + response.status + ").");
	return response;
}
async function createRealtimeTicket(env, { room, userId, origin, publish = false, presence = false }) {
	return (await call(env, "/ticket", {
		room,
		userId,
		origin,
		publish,
		presence
	})).json();
}
async function publishRealtime(env, { room, event, data }) {
	await call(env, "/publish", {
		room,
		event,
		data
	});
}
// src/worker/index.ts
var cached;
function authFor(env) {
	if (!env.FREEBUFF_CLIENT_ID) return null;
	const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER}|${env.APP_ORIGIN}`;
	if (cached?.key !== key) cached = {
		key,
		auth: createFreebuffAuth({
			clientId: env.FREEBUFF_CLIENT_ID,
			issuer: env.FREEBUFF_ISSUER,
			baseUrl: env.APP_ORIGIN,
			allowInsecureLocalhost: env.APP_ORIGIN.startsWith("http://127.0.0.1:")
		})
	};
	return cached.auth;
}
var initialized = /* @__PURE__ */ new WeakMap();
function initialize(db) {
	let pending = initialized.get(db);
	if (!pending) {
		pending = db.batch([
			db.prepare("CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL, last_create INTEGER NOT NULL DEFAULT 0)"),
			db.prepare("CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL, white_id TEXT, black_id TEXT, white_sub TEXT, black_sub TEXT, created_at INTEGER NOT NULL, state TEXT NOT NULL)"),
			db.prepare("CREATE INDEX IF NOT EXISTS games_lobby ON games(status, public, created_at)"),
			db.prepare("CREATE INDEX IF NOT EXISTS games_white ON games(white_id, created_at)"),
			db.prepare("CREATE INDEX IF NOT EXISTS games_black ON games(black_id, created_at)"),
			db.prepare("CREATE INDEX IF NOT EXISTS games_white_sub ON games(white_sub, status, created_at)"),
			db.prepare("CREATE INDEX IF NOT EXISTS games_black_sub ON games(black_sub, status, created_at)"),
			db.prepare("CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, from_name TEXT NOT NULL, from_sub TEXT, to_id TEXT NOT NULL, to_name TEXT NOT NULL, to_sub TEXT, minutes INTEGER NOT NULL, increment INTEGER NOT NULL, color TEXT NOT NULL, status TEXT NOT NULL, game_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ack INTEGER NOT NULL DEFAULT 0)"),
			db.prepare("CREATE INDEX IF NOT EXISTS challenges_to ON challenges(to_id, status, created_at)"),
			db.prepare("CREATE INDEX IF NOT EXISTS challenges_from ON challenges(from_id, status, created_at)")
		]).then(async (result) => {
			await db.prepare("ALTER TABLE players ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
			return result;
		}).catch((error) => {
			initialized.delete(db);
			throw error;
		});
		initialized.set(db, pending);
	}
	return pending;
}
async function hash(value) {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function load(db, key) {
	if (!/^[a-z0-9-]{8,36}$/.test(key)) return null;
	const row = await db.prepare("SELECT state FROM games WHERE id = ? OR code = ? LIMIT 1").bind(key, key).first();
	return row ? JSON.parse(row.state) : null;
}
async function save(db, before, next) {
	next = {
		...next,
		revision: before.revision + 1
	};
	if ((await db.prepare("UPDATE games SET state = ?, revision = ?, status = ?, white_id = ?, black_id = ?, white_sub = ?, black_sub = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(next), next.revision, next.status, next.white?.id ?? null, next.black?.id ?? null, next.white?.sub ?? null, next.black?.sub ?? null, next.id, before.revision).run()).meta.changes !== 1) throw new GameError("La partida cambió. Inténtalo de nuevo.");
	return next;
}
async function broadcast(env, game) {
	if (!env.REALTIME) return;
	try {
		await publishRealtime(env, {
			room: `game:${game.id}`,
			event: "changed",
			data: { revision: game.revision }
		});
	} catch {
		console.warn("Realtime publication unavailable; clients will refresh the snapshot.");
	}
}
function view(game, player, now) {
	return publicGame(game, actorFor(game, player), now);
}
var ONLINE_WINDOW_MS = 25e3;
var CHALLENGE_COOLDOWN_MS = 3e3;
function asChallenge(row) {
	return {
		id: row.id,
		from: {
			id: row.from_id,
			name: row.from_name,
			sub: row.from_sub
		},
		to: {
			id: row.to_id,
			name: row.to_name,
			sub: row.to_sub
		},
		minutes: row.minutes,
		increment: row.increment,
		color: row.color,
		status: row.status,
		gameId: row.game_id,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		ack: row.ack
	};
}
async function expireChallenges(db, now) {
	await db.prepare("UPDATE challenges SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?").bind(now).run();
}
async function presence(db, now) {
	const rows = await db.prepare("SELECT id, status, state FROM games WHERE status IN ('waiting', 'playing') AND created_at > ? ORDER BY created_at DESC LIMIT 200").bind(now - 864e5).all();
	const seats = /* @__PURE__ */ new Map();
	for (const row of rows.results) {
		const game = JSON.parse(row.state);
		for (const member of [game.white, game.black]) {
			if (!member) continue;
			const existing = seats.get(member.id);
			if (existing && (existing.status === "playing" || row.status !== "playing")) continue;
			seats.set(member.id, {
				gameId: game.id,
				status: row.status,
				minutes: game.minutes,
				increment: game.increment,
				public: game.public
			});
		}
	}
	return seats;
}
async function insertGame(db, game) {
	await db.prepare("INSERT INTO games (id, code, revision, status, public, white_id, black_id, white_sub, black_sub, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(game.id, game.code, 0, game.status, Number(game.public), game.white?.id ?? null, game.black?.id ?? null, game.white?.sub ?? null, game.black?.sub ?? null, game.createdAt, JSON.stringify(game)).run();
}
var app = new Hono();
app.use("/api/*", bodyLimit({
	maxSize: 4096,
	onError: (c) => c.json({ error: "La solicitud es demasiado grande." }, 413)
}));
app.use("/api/*", async (c, next) => {
	c.header("Cache-Control", "private, no-store");
	if (!c.env.DB || !c.env.APP_ORIGIN) return c.json({ error: "La base de datos del juego no está conectada." }, 503);
	if (c.req.method !== "GET" && !isSameOriginRequest(c.req.raw, c.env.APP_ORIGIN)) return c.json({ error: "Solicitud de otro origen rechazada." }, 403);
	if (c.req.method !== "GET" && !c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "Envía JSON." }, 415);
	if (Number(c.req.header("content-length") ?? 0) > 4096) return c.json({ error: "La solicitud es demasiado grande." }, 413);
	await initialize(c.env.DB);
	const token = getCookie(c, c.env.APP_ORIGIN.startsWith("https:") ? "__Host-rook" : "rook-local");
	const stored = token && /^[a-f0-9]{64}$/.test(token) ? await c.env.DB.prepare("SELECT id, name FROM players WHERE token_hash = ? AND expires_at > ?").bind(await hash(token), Date.now()).first() : null;
	const user = await authFor(c.env)?.getUser(c.req.raw);
	if (stored) c.set("player", {
		...stored,
		name: user?.name?.slice(0, 40) || stored.name,
		sub: user?.sub ?? null
	});
	else if (c.req.path !== "/api/session") return c.json({ error: "Recarga la página para entrar como invitado." }, 401);
	await next();
});
app.post("/api/session", async (c) => {
	let player = c.get("player");
	const user = await authFor(c.env)?.getUser(c.req.raw);
	if (!player) {
		const token = Array.from(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
		player = {
			id: crypto.randomUUID(),
			name: user?.name?.slice(0, 40) || `Invitado ${Math.floor(1e3 + Math.random() * 9e3)}`,
			sub: user?.sub ?? null
		};
		await c.env.DB.prepare("INSERT INTO players (id, token_hash, name, expires_at) VALUES (?, ?, ?, ?)").bind(player.id, await hash(token), player.name, Date.now() + 2592e6).run();
		const secure = c.env.APP_ORIGIN.startsWith("https:");
		setCookie(c, secure ? "__Host-rook" : "rook-local", token, {
			httpOnly: true,
			secure,
			sameSite: "Lax",
			path: "/",
			maxAge: 2592e3
		});
	}
	return c.json({
		name: player.name,
		signedIn: !!user,
		authEnabled: !!c.env.FREEBUFF_CLIENT_ID,
		realtime: !!c.env.REALTIME
	});
});
app.get("/api/history", async (c) => {
	const player = c.get("player");
	const games = (await c.env.DB.prepare("SELECT state FROM games WHERE ((white_id = ? AND white_sub IS NULL) OR (black_id = ? AND black_sub IS NULL) OR white_sub = ? OR black_sub = ?) ORDER BY created_at DESC LIMIT 50").bind(player.id, player.id, player.sub, player.sub).all()).results.map((row) => {
		const game = JSON.parse(row.state);
		return publicGame(game, player.sub && game.white?.sub === player.sub ? game.white.id : player.sub && game.black?.sub === player.sub ? game.black.id : player.id, Date.now());
	});
	const stats = player.sub ? await c.env.DB.prepare(`SELECT COUNT(*) AS played, SUM(CASE WHEN (white_sub = ? AND json_extract(state, '$.result') = '1-0') OR (black_sub = ? AND json_extract(state, '$.result') = '0-1') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN json_extract(state, '$.result') = '½-½' THEN 1 ELSE 0 END) AS draws FROM games WHERE status = 'finished' AND (white_sub = ? OR black_sub = ?)`).bind(player.sub, player.sub, player.sub, player.sub).first() : null;
	return c.json({
		games,
		stats
	});
});
app.post("/api/games", async (c) => {
	const body = await c.req.json();
	if (!CONTROLS.some((t) => t.minutes === body.minutes && t.increment === body.increment) || typeof body.public !== "boolean" || ![
		"w",
		"b",
		"random"
	].includes(body.color)) return c.json({ error: "Elige un ritmo de juego y un color." }, 400);
	const player = c.get("player");
	if (!(await c.env.DB.prepare("UPDATE players SET last_create = ? WHERE id = ? AND last_create < ?").bind(Date.now(), player.id, Date.now() - 5e3).run()).meta.changes) return c.json({ error: "Espera un momento antes de crear otra partida." }, 429);
	if ((await c.env.DB.prepare("SELECT id FROM games WHERE status IN ('waiting', 'playing') AND (white_id = ? OR black_id = ?) AND created_at > ? LIMIT 5").bind(player.id, player.id, Date.now() - 864e5).all()).results.length >= 5) return c.json({ error: "Termina o cancela antes una partida abierta." }, 409);
	const game = newGame(player, {
		...body,
		color: body.color === "random" ? Math.random() < .5 ? "w" : "b" : body.color
	}, Date.now());
	await insertGame(c.env.DB, game);
	return c.json(publicGame(game, player.id, Date.now()), 201);
});
app.get("/api/games/:id", async (c) => {
	let game = await load(c.env.DB, c.req.param("id"));
	if (!game) return c.json({ error: "Partida no encontrada." }, 404);
	const settled = settleClock(game, Date.now());
	if (settled !== game) try {
		game = await save(c.env.DB, game, settled);
		c.executionCtx.waitUntil(broadcast(c.env, game));
	} catch (error) {
		if (!(error instanceof GameError)) throw error;
		game = await load(c.env.DB, game.id);
	}
	return c.json(view(game, c.get("player"), Date.now()));
});
app.post("/api/games/:id/:action", async (c) => {
	const game = await load(c.env.DB, c.req.param("id"));
	if (!game) return c.json({ error: "Partida no encontrada." }, 404);
	const player = c.get("player"), action = c.req.param("action"), now = Date.now();
	const body = await c.req.json();
	const actor = actorFor(game, player);
	const seat = seatFor(game, actor);
	let next;
	if (action === "join") next = actor ? game : joinGame(game, player, now);
	else {
		if (!seat) return c.json({ error: "Solo los jugadores pueden cambiar esta partida." }, 403);
		if (body.revision !== game.revision) return c.json({ error: "El tablero cambió. Inténtalo de nuevo." }, 409);
		next = settleClock(game, now);
		if (next === game) {
			if (action === "cancel" && game.status === "waiting") next = {
				...game,
				status: "cancelled"
			};
			else if (game.status !== "playing") return c.json({ error: "La partida no está en juego." }, 409);
			else if (action === "move") next = moveGame(game, actor, body.from ?? "", body.to ?? "", body.promotion, now);
			else if (action === "resign") next = finish(game, seat === "w" ? "0-1" : "1-0", "Abandono", now);
			else if (action === "draw") next = game.drawOffer && game.drawOffer !== seat ? finish(game, "½-½", "Tablas acordadas", now) : {
				...game,
				drawOffer: seat
			};
			else if (action === "decline") next = {
				...game,
				drawOffer: null
			};
			else return c.json({ error: "Acción desconocida." }, 400);
		}
	}
	if (next !== game) next = await save(c.env.DB, game, next);
	c.executionCtx.waitUntil(broadcast(c.env, next));
	return c.json(view(next, player, Date.now()));
});
app.post("/api/players", async (c) => {
	const player = c.get("player"), now = Date.now(), db = c.env.DB;
	await db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").bind(now, player.id).run();
	await expireChallenges(db, now);
	const online = await db.prepare("SELECT id, name FROM players WHERE last_seen > ? AND id != ? ORDER BY last_seen DESC LIMIT 50").bind(now - ONLINE_WINDOW_MS, player.id).all();
	const seats = await presence(db, now);
	const pending = await db.prepare("SELECT * FROM challenges WHERE status = 'pending' AND (from_id = ? OR to_id = ?) ORDER BY created_at DESC").bind(player.id, player.id).all();
	const incoming = pending.results.find((row) => row.to_id === player.id);
	const outgoing = pending.results.find((row) => row.from_id === player.id);
	const answered = await db.prepare("SELECT * FROM challenges WHERE from_id = ? AND status != 'pending' AND ack = 0 AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(player.id, now - 12e4).first();
	const lobby = {
		serverNow: now,
		players: online.results.map((row) => {
			const seat = seats.get(row.id);
			return {
				id: row.id,
				name: row.name,
				status: seat ? "busy" : "free",
				table: seat && seat.status === "waiting" && seat.public ? {
					id: seat.gameId,
					minutes: seat.minutes,
					increment: seat.increment
				} : null,
				challenged: !!outgoing && outgoing.to_id === row.id
			};
		}),
		incoming: incoming ? challengeView(asChallenge(incoming), "to") : null,
		outgoing: outgoing ? challengeView(asChallenge(outgoing), "from") : null,
		event: answered ? challengeView(asChallenge(answered), "from") : null
	};
	return c.json(lobby);
});
app.post("/api/challenges", async (c) => {
	const body = await c.req.json();
	if (!CONTROLS.some((t) => t.minutes === body.minutes && t.increment === body.increment) || ![
		"w",
		"b",
		"random"
	].includes(body.color) || typeof body.target !== "string") return c.json({ error: "Elige un ritmo de juego y un color." }, 400);
	const player = c.get("player"), now = Date.now(), db = c.env.DB;
	if (body.target === player.id) return c.json({ error: "No puedes retarte a ti mismo." }, 400);
	await expireChallenges(db, now);
	if (await db.prepare("SELECT id FROM challenges WHERE from_id = ? AND created_at > ? LIMIT 1").bind(player.id, now - CHALLENGE_COOLDOWN_MS).first()) return c.json({ error: "Espera un momento antes de enviar otro reto." }, 429);
	const target = await db.prepare("SELECT id, name FROM players WHERE id = ? AND last_seen > ?").bind(body.target, now - ONLINE_WINDOW_MS).first();
	if (!target) return c.json({ error: "Ese jugador ya no está conectado." }, 409);
	const seats = await presence(db, now);
	if (seats.has(player.id)) return c.json({ error: "Termina tu partida antes de retar a alguien." }, 409);
	if (seats.has(target.id)) return c.json({ error: `${target.name} está en una partida.` }, 409);
	if (await db.prepare("SELECT id FROM challenges WHERE status = 'pending' AND from_id = ? LIMIT 1").bind(player.id).first()) return c.json({ error: "Ya tienes un reto pendiente." }, 409);
	if (await db.prepare("SELECT id FROM challenges WHERE status = 'pending' AND to_id = ? LIMIT 1").bind(target.id).first()) return c.json({ error: `${target.name} tiene otro reto pendiente.` }, 409);
	const challenge = newChallenge(player, {
		id: target.id,
		name: target.name,
		sub: null
	}, {
		minutes: body.minutes,
		increment: body.increment,
		color: body.color
	}, now);
	await db.prepare("INSERT INTO challenges (id, from_id, from_name, from_sub, to_id, to_name, to_sub, minutes, increment, color, status, game_id, created_at, expires_at, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(challenge.id, challenge.from.id, challenge.from.name, challenge.from.sub, challenge.to.id, challenge.to.name, challenge.to.sub, challenge.minutes, challenge.increment, challenge.color, challenge.status, challenge.gameId, challenge.createdAt, challenge.expiresAt, challenge.ack).run();
	return c.json(challengeView(challenge, "from"), 201);
});
app.post("/api/challenges/:id/:action", async (c) => {
	const player = c.get("player"), now = Date.now(), db = c.env.DB, action = c.req.param("action");
	const row = await db.prepare("SELECT * FROM challenges WHERE id = ?").bind(c.req.param("id")).first();
	if (!row) return c.json({ error: "Ese reto ya no existe." }, 404);
	if (action === "seen") {
		if (row.from_id !== player.id) return c.json({ error: "Ese reto no es tuyo." }, 403);
		await db.prepare("UPDATE challenges SET ack = 1 WHERE id = ?").bind(row.id).run();
		return c.json({ ok: true });
	}
	if (action === "cancel") {
		if (row.from_id !== player.id) return c.json({ error: "Ese reto no es tuyo." }, 403);
		if (!(await db.prepare("UPDATE challenges SET status = 'cancelled', ack = 1 WHERE id = ? AND status = 'pending'").bind(row.id).run()).meta.changes) return c.json({ error: "El reto ya no está disponible." }, 409);
		return c.json({
			ok: true,
			status: "cancelled"
		});
	}
	if (action !== "accept" && action !== "decline") return c.json({ error: "Acción desconocida." }, 400);
	if (row.to_id !== player.id) return c.json({ error: "Ese reto no es para ti." }, 403);
	if (row.status !== "pending") return c.json({ error: "El reto ya no está disponible." }, 409);
	if (row.expires_at <= now) {
		await db.prepare("UPDATE challenges SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(row.id).run();
		return c.json({ error: "El reto caducó." }, 409);
	}
	if (!(await db.prepare(`UPDATE challenges SET status = ?, game_id = ? WHERE id = ? AND status = 'pending'`).bind(action === "accept" ? "accepted" : "declined", null, row.id).run()).meta.changes) return c.json({ error: "El reto ya no está disponible." }, 409);
	if (action === "decline") return c.json({
		ok: true,
		status: "declined"
	});
	if ((await presence(db, now)).get(row.from_id)?.status === "playing") {
		await db.prepare("UPDATE challenges SET status = 'cancelled', ack = 0 WHERE id = ?").bind(row.id).run();
		return c.json({ error: "Ese jugador ya está en otra partida." }, 409);
	}
	const color = row.color === "random" ? Math.random() < .5 ? "w" : "b" : row.color;
	const game = joinGame(newGame(asChallenge(row).from, {
		minutes: row.minutes,
		increment: row.increment,
		public: false,
		color
	}, now), {
		id: player.id,
		name: player.name,
		sub: player.sub
	}, now);
	if (!(await db.prepare("UPDATE challenges SET game_id = ? WHERE id = ? AND status = 'accepted'").bind(game.id, row.id).run()).meta.changes) {
		await db.prepare("DELETE FROM games WHERE id = ?").bind(game.id).run();
		return c.json({ error: "El reto ya no está disponible." }, 409);
	}
	await insertGame(db, game);
	c.executionCtx.waitUntil(broadcast(c.env, game));
	return c.json(publicGame(game, player.id, Date.now()), 201);
});
app.post("/api/realtime/ticket", async (c) => {
	if (!c.env.REALTIME) return c.json({ error: "La conexión en tiempo real no está disponible." }, 503);
	const { room } = await c.req.json();
	if (typeof room !== "string" || !room.startsWith("game:")) return c.json({ error: "Sala no válida." }, 400);
	const game = await load(c.env.DB, room.slice(5));
	if (!game || !actorFor(game, c.get("player"))) return c.json({ error: "Únete a la partida primero." }, 403);
	return c.json(await createRealtimeTicket(c.env, {
		room: `game:${game.id}`,
		userId: c.get("player").id,
		origin: c.env.APP_ORIGIN,
		publish: false,
		presence: true
	}));
});
app.onError((error, c) => {
	if (error instanceof GameError) return c.json({ error: error.message }, 409);
	if (error instanceof SyntaxError) return c.json({ error: "Solicitud no válida." }, 400);
	console.error("Chess request failed", error.name);
	return c.json({ error: "No se pudo completar la solicitud. Inténtalo de nuevo." }, 500);
});
app.notFound((c) => c.req.path.startsWith("/auth/") ? c.json({ error: "Iniciar sesión con Freebuff no está habilitado en esta vista previa." }, 503) : c.req.path.startsWith("/api/") ? c.json({ error: "No encontrado." }, 404) : c.env.ASSETS.fetch(c.req.raw));
// \0virtual:cloudflare/worker-entry
var worker_entry_default = { fetch(request, env, ctx) {
	const handler = (req) => Promise.resolve(app.fetch(req, env, ctx));
	return authFor(env)?.wrap(handler)(request) ?? handler(request);
} };
export { worker_entry_default as default };

//# sourceMappingURL=index.js.map