@ryan cavanaugh

thanks for taking a look

you can build this project with

$ tsc

you will notice in the dist/systemjs-bundle.js that there are only
12 System.register calls (try ctrl+f)

However, my lib directory has many more than 12 .ts/.js files

so the first problem (1) is that TSC is not picking up all my files


the second problem (2) is that TSC is not taking my modules
and accurately transpiling them, e.g.:

an original module looks like this:


```typescript

'use strict';

//polyfills
const process = require('suman-browser-polyfills/modules/process');
const global = require('suman-browser-polyfills/modules/global');

//core
const domain = require('domain');
const util = require('util');

//npm
const pragmatik = require('pragmatik');
const async = require('async');
const colors = require('colors/safe');

//project
const _suman = global.__suman = (global.__suman || {});
const rules = require('../helpers/handle-varargs');
const constants = require('../../config/suman-constants');
const handleSetupComplete = require('../handle-setup-complete');

///////////////////////////////////////////////////////////////////////////////////////

function handleBadOptions(opts: IAfterOpts): void {

    if (opts.plan !== undefined && !Number.isInteger(opts.plan)) {
        console.error(' => Suman usage error => "plan" option is not an integer.');
        process.exit(constants.EXIT_CODES.OPTS_PLAN_NOT_AN_INTEGER);
        return;
    }
}

//////////////////////////// inline types  ///////////////////////////////////

//TODO

////////////////////////////////////////////////////////////////////////////

export = function (suman: ISuman, zuite: ITestSuite): Function {

    return function ($desc: string, $opts: IAfterOpts, $fn: Function): ITestSuite {

        handleSetupComplete(zuite);

        const args: Array<any> = pragmatik.parse(arguments, rules.hookSignature, {
            preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
        });

        // this transpiles much more nicely, rather than inlining it above
        const [desc, opts, fn] = args;
        handleBadOptions(opts);

        if (opts.skip) {
            suman.numHooksSkipped++;
        }
        else if (!fn) {
            suman.numHooksStubbed++;
        }
        else {
            zuite.getAfters().push({
                ctx: zuite,
                timeout: opts.timeout || 11000,
                desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                cb: opts.cb || false,
                throws: opts.throws,
                planCountExpected: opts.plan,
                fatal: !(opts.fatal === false),
                fn: fn,
                type: 'after/teardown',
                warningErr: new Error('SUMAN_TEMP_WARNING_ERROR')
            });
        }

        return zuite;

    };


};


```

but the transpiled module looks like this:


```javascript

System.register("test-suite-methods/make-after", [], function (exports_7, context_7) {
    'use strict';
    var __moduleName = context_7 && context_7.id;
    function handleBadOptions(opts) {
        if (opts.plan !== undefined && !Number.isInteger(opts.plan)) {
            console.error(' => Suman usage error => "plan" option is not an integer.');
            process.exit(constants.EXIT_CODES.OPTS_PLAN_NOT_AN_INTEGER);
            return;
        }
    }
    var process, global, domain, util, pragmatik, async, colors, _suman, rules, constants, handleSetupComplete;
    return {
        setters: [],
        execute: function () {
            process = require('suman-browser-polyfills/modules/process');
            global = require('suman-browser-polyfills/modules/global');
            domain = require('domain');
            util = require('util');
            pragmatik = require('pragmatik');
            async = require('async');
            colors = require('colors/safe');
            _suman = global.__suman = (global.__suman || {});
            rules = require('../helpers/handle-varargs');
            constants = require('../../config/suman-constants');
            handleSetupComplete = require('../handle-setup-complete');
        }
    };
});

```



also, I would like to be able to bundle everything, including node_modules,
that is a whole other challenge I think.



