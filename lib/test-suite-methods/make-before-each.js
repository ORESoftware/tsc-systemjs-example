'use strict';
var domain = require('domain');
var util = require('util');
var pragmatik = require('pragmatik');
var async = require('async');
var colors = require('colors/safe');
var _suman = global.__suman = (global.__suman || {});
var rules = require('../helpers/handle-varargs');
var constants = require('../../config/suman-constants');
var handleSetupComplete = require('../handle-setup-complete');
function handleBadOptions(opts) {
    if (opts.plan !== undefined && !Number.isInteger(opts.plan)) {
        console.error(' => Suman usage error => "plan" option is not an integer.');
        process.exit(constants.EXIT_CODES.OPTS_PLAN_NOT_AN_INTEGER);
        return;
    }
}
module.exports = function (suman, zuite) {
    return function ($desc, $opts, $aBeforeEach) {
        handleSetupComplete(zuite);
        var args = pragmatik.parse(arguments, rules.hookSignature, {
            preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
        });
        var desc = args[0], opts = args[1], fn = args[2];
        handleBadOptions(opts);
        if (opts.skip) {
            suman.numHooksSkipped++;
        }
        else if (!fn) {
            suman.numHooksStubbed++;
        }
        else {
            zuite.getBeforeEaches().push({
                ctx: zuite,
                timeout: opts.timeout || 11000,
                desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                fn: fn,
                throws: opts.throws,
                planCountExpected: opts.plan,
                fatal: !(opts.fatal === false),
                cb: opts.cb || false,
                type: 'beforeEach/setupTest',
                warningErr: new Error('SUMAN_TEMP_WARNING_ERROR')
            });
        }
        return zuite;
    };
};
