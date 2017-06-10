var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
'use strict';
var process = require('suman-browser-polyfills/modules/process');
var global = require('suman-browser-polyfills/modules/global');
var util = require('util');
var fnArgs = require('function-arguments');
var sumanUtils = require('suman-utils');
var _suman = global.__suman = (global.__suman || {});
var makeGen = require('./helpers/async-gen');
module.exports = function acquireDependencies(depList, depContainerObj, cb) {
    var obj = {};
    depList.forEach(function (dep) {
        obj[dep] = depContainerObj[dep];
        if (!obj[dep]) {
            throw new Error(' => Suman fatal error => no integrant with name = "' + dep +
                '" was found in your suman.once.js file.');
        }
        if (typeof obj[dep] !== 'function') {
            throw new Error(' => Suman fatal error => integrant entity with name = "' + dep +
                '" was not found to be a function => ' + util.inspect(obj[dep]));
        }
    });
    var temp = Object.keys(obj).map(function (key) {
        var fn = obj[key];
        return new Promise(function (resolve, reject) {
            if (_suman.sumanOpts.verbose || sumanUtils.isSumanDebug()) {
                console.log(' => Executing dep with key = "' + key + '"');
            }
            setTimeout(function () {
                reject(new Error('Suman dependency acquisition timed-out for dependency with key/id="' + key + '"'));
            }, _suman.weAreDebugging ? 5000000 : 50000);
            if (typeof fn !== 'function') {
                reject(new Error(' => Suman usage error => would-be function was undefined or otherwise ' +
                    'not a function => ' + String(fn)));
            }
            else if (fn.length > 0 && sumanUtils.isGeneratorFn(fn)) {
                reject(new Error(' => Suman usage error => function was a generator function but also took a callback' + String(fn)));
            }
            else if (sumanUtils.isGeneratorFn(fn)) {
                var gen = makeGen(fn, null);
                gen.call(null).then(resolve, reject);
            }
            else if (fn.length > 0) {
                var args = fnArgs(fn);
                var str = fn.toString();
                var matches = str.match(new RegExp(args[0], 'g')) || [];
                if (matches.length < 2) {
                    throw new Error(' => Suman usage error => Callback in your function was not present => ' + str);
                }
                fn.call(null, function (err, val) {
                    err ? reject(err) : resolve(val);
                });
            }
            else {
                Promise.resolve(fn.call(null)).then(resolve, reject);
            }
        });
    });
    Promise.all(temp).then(function (deps) {
        Object.keys(obj).forEach(function (key, index) {
            obj[key] = deps[index];
            sumanUtils.runAssertionToCheckForSerialization(obj[key]);
        });
        cb(null, obj);
    }, function (err) {
        err = new Error(' => Suman fatal error => Suman had a problem verifying your integrants in ' +
            'your suman.once.js file. => \n' + (err.stack || err));
        cb(err, {});
    });
};
define("lib/freeze-existing", ["require", "exports"], function (require, exports) {
    'use strict';
    return function freezeExistingProps(obj) {
        try {
            Object.keys(obj).forEach(function (key) {
                Object.defineProperty(obj, key, {
                    writable: false
                });
            });
        }
        catch (err) { }
        return obj;
    };
});
define("lib/index", ["require", "exports"], function (require, exports) {
    'use strict';
    var process = require('suman-browser-polyfills/modules/process');
    var global = require('suman-browser-polyfills/modules/global');
    var util = require('util');
    var Mod = require('module');
    var req = Mod.prototype && Mod.prototype.require;
    var inBrowser = false;
    var _suman = global.__suman = (global.__suman || {});
    var sumanOptsFromRunner = _suman.sumanOpts || (process.env.SUMAN_OPTS ? JSON.parse(process.env.SUMAN_OPTS) : {});
    var sumanOpts = _suman.sumanOpts = (_suman.sumanOpts || sumanOptsFromRunner);
    try {
        window.module = { filename: '/' };
        module.parent = module;
        inBrowser = _suman.inBrowser = true;
    }
    catch (err) {
        inBrowser = _suman.inBrowser = false;
    }
    if (_suman.sumanOpts.verbosity > 8) {
        console.log(' => Are we in browser? => ', inBrowser ? 'yes!' : 'no.');
    }
    var count = 0;
    Mod.prototype && (Mod.prototype.require = function () {
        var args = Array.from(arguments);
        var lastArg = args[args.length - 1];
        var ret = req.apply(this, arguments);
        return ret;
    });
    var oncePostFn;
    var sumanRuntimeErrors = _suman.sumanRuntimeErrors = _suman.sumanRuntimeErrors || [];
    var fatalRequestReply = require('./helpers/fatal-request-reply');
    var async = require('async');
    var constants = require('../config/suman-constants');
    var weAreDebugging = require('../lib/helpers/we-are-debugging');
    if (process.env.SUMAN_DEBUG === 'yes') {
        console.log(' => Suman require.main => ', require.main.filename);
        console.log(' => Suman parent module => ', module.parent.filename);
    }
    process.on('warning', function (w) {
        if (weAreDebugging) {
            console.error(w.stack || w);
        }
        else if (!(/deprecated/i.test(String(w)))) {
            console.error(w.stack || w);
        }
    });
    process.on('uncaughtException', function (err) {
        if (typeof err !== 'object') {
            console.log(colors.bgMagenta.black(' => Error is not an object => ', util.inspect(err)));
            err = { stack: typeof err === 'string' ? err : util.inspect(err) };
        }
        if (err._alreadyHandledBySuman) {
            console.error(' => Error already handled => \n', (err.stack || err));
        }
        else {
            sumanRuntimeErrors.push(err);
            var msg_1 = err.stack || err;
            err._alreadyHandledBySuman = true;
            console.error('\n\n', colors.magenta(' => Suman uncaught exception => \n' + msg_1));
            if (String(msg_1).match(/suite is not a function/i)) {
                process.stderr.write('\n\n => Suman tip => You may be using the wrong test interface try TDD instead of BDD or vice versa;' +
                    '\n\tsee sumanjs.github.io\n\n');
            }
            else if (String(msg_1).match(/describe is not a function/i)) {
                process.stderr.write('\n\n => Suman tip => You may be using the wrong test interface try TDD instead of BDD or vice versa;' +
                    '\n\tsee sumanjs.github.io\n\n');
            }
            if (!_suman.sumanOpts || (_suman.sumanOpts && _suman.sumanOpts.ignoreUncaughtExceptions !== false)) {
                _suman.sumanUncaughtExceptionTriggered = true;
                console.error('\n\n', ' => Given uncaught exception,' +
                    ' Suman will now run suman.once.post.js shutdown hooks...');
                console.error('\n\n', ' ( => TO IGNORE UNCAUGHT EXCEPTIONS AND CONTINUE WITH YOUR TEST(S), use ' +
                    'the "--ignore-uncaught-exceptions" option.)');
                async.parallel([
                    function (cb) {
                        if (!oncePostFn) {
                            console.error(' => Suman internal warning, oncePostFn not yet defined.');
                            return process.nextTick(cb);
                        }
                        oncePostFn(cb);
                    },
                    function (cb) {
                        fatalRequestReply({
                            type: constants.runner_message_type.FATAL,
                            data: {
                                error: msg_1,
                                msg: msg_1
                            }
                        }, cb);
                    }
                ], function (err, resultz) {
                    var results = resultz[0];
                    if (err) {
                        console.error(err.stack || err);
                    }
                    if (Array.isArray(results)) {
                        results.filter(function (r) { return r; }).forEach(function (r) {
                            console.error(r.stack || r);
                        });
                        process.nextTick(function () {
                            process.exit(88);
                        });
                    }
                    else {
                        process.nextTick(function () {
                            process.exit(89);
                        });
                    }
                });
            }
        }
    });
    process.on('unhandledRejection', function (reason, p) {
        reason = (reason.stack || reason);
        console.error('Unhandled Rejection at: Promise ', p, '\n\n=> Rejection reason => ', reason, '\n\n=> stack =>', reason);
        if (!_suman.sumanOpts || (_suman.sumanOpts && _suman.sumanOpts.ignoreUncaughtExceptions !== false)) {
            _suman.sumanUncaughtExceptionTriggered = true;
            fatalRequestReply({
                type: constants.runner_message_type.FATAL,
                data: {
                    error: reason,
                    msg: reason
                }
            }, function () {
                process.exit(53);
            });
        }
    });
    var domain = require('domain');
    var os = require('os');
    var assert = require('assert');
    var path = require('path');
    var cp = require('child_process');
    var EE = require('events');
    var stream = require('stream');
    var fs = require('fs');
    var stack = require('callsite');
    var colors = require('colors/safe');
    var pragmatik = require('pragmatik');
    var debug = require('suman-debug')('s:index');
    require('./patches/all');
    var rules = require('./helpers/handle-varargs');
    var makeSuman = require('./suman');
    var su = require('suman-utils');
    var acquireDeps = require('./acquire-deps');
    var acquireIntegrantsSingleProcess = require('./acquire-integrants-single-proc');
    var es = require('./exec-suite');
    var fnArgs = require('function-arguments');
    var makeIocDepInjections = require('./injection/ioc-injector');
    var integPreConfiguration = null;
    var allOncePreKeys = _suman.oncePreKeys = [];
    var allOncePostKeys = _suman.oncePostKeys = [];
    var integrantsEmitter = _suman.integrantsEmitter = (_suman.integrantsEmitter || new EE());
    var integProgressEmitter = _suman.integProgressEmitter = (_suman.integProgressEmitter || new EE());
    var integContainer = _suman.integContainer = (_suman.integContainer || {});
    var integProgressContainer = _suman.integProgressContainer = (_suman.integProgressContainer || {});
    var iocEmitter = _suman.iocEmitter = (_suman.iocEmitter || new EE());
    var iocContainer = _suman.iocContainer = (_suman.iocContainer || {});
    var iocProgressContainer = _suman.iocProgressContainer = (_suman.iocProgressContainer || {});
    var resultBroadcaster = _suman.resultBroadcaster = (_suman.resultBroadcaster || new EE());
    var sumanReporters = _suman.sumanReporters = (_suman.sumanReporters || []);
    var suiteResultEmitter = _suman.suiteResultEmitter = (_suman.suiteResultEmitter || new EE());
    var pkgDotJSON = require('../package.json');
    var gv;
    if (gv = process.env.SUMAN_GLOBAL_VERSION) {
        var lv = String(pkgDotJSON.version);
        debug(' => Global version => ', gv);
        debug(' => Local version => ', lv);
        if (gv !== lv) {
            console.error('\n\n', colors.red(' => Suman warning => You local version of Suman differs from the cli version of Suman.'));
            console.error(colors.cyan(' => Global version => '), gv);
            console.error(colors.cyan(' => Local version => '), lv, '\n\n');
        }
    }
    var counts = require('./helpers/suman-counts');
    var cwd = process.cwd();
    var projectRoot = _suman.projectRoot = _suman.projectRoot || su.findProjectRoot(cwd) || '/';
    require('./helpers/handle-suman-counts');
    oncePostFn = require('./helpers/handle-suman-once-post');
    var singleProc = process.env.SUMAN_SINGLE_PROCESS === 'yes';
    var isViaSumanWatch = process.env.SUMAN_WATCH === 'yes';
    var main = require.main.filename;
    var usingRunner = _suman.usingRunner = (_suman.usingRunner || process.env.SUMAN_RUNNER === 'yes');
    var sumanConfig = require('./helpers/load-suman-config')(null);
    if (!_suman.usingRunner && !_suman.viaSuman) {
        require('./helpers/print-version-info');
    }
    if (sumanOpts.verbose && !usingRunner && !_suman.viaSuman) {
        console.log(' => Suman verbose message => Project root:', projectRoot);
    }
    var sumanPaths = require('./helpers/resolve-shared-dirs')(sumanConfig, projectRoot, sumanOpts);
    var sumanObj = require('./helpers/load-shared-objects')(sumanPaths, projectRoot, sumanOpts);
    var integrantPreFn = sumanObj.integrantPreFn;
    var iocFn = sumanObj.iocFn;
    var testDebugLogPath = sumanPaths.testDebugLogPath;
    var testLogPath = sumanPaths.testLogPath;
    fs.writeFileSync(testDebugLogPath, '\n', { flag: 'w' });
    fs.writeFileSync(testLogPath, '\n => New Suman run @' + new Date(), { flag: 'w' });
    if (sumanReporters.length < 1) {
        var fn = void 0;
        if (_suman.sumanOpts.useTAPOutput) {
            if (_suman.sumanOpts.verbosity > 7) {
                console.log(' => Using TAP reporter.');
            }
            fn = require('./reporters/tap-reporter');
        }
        else {
            fn = require('./reporters/std-reporter');
        }
        assert(typeof fn === 'function', 'Native reporter fail.');
        _suman.sumanReporters.push(fn);
        fn.call(null, resultBroadcaster);
    }
    var loaded = false;
    var moduleCount = 0;
    var init = function ($module, $opts, confOverride) {
        debugger;
        if (init.$ingletonian) {
            if (process.env.SUMAN_SINGLE_PROCESS !== 'yes') {
                console.error(colors.red(' => Suman usage warning => suman.init() only needs to be called once per test file.'));
                return init.$ingletonian;
            }
        }
        require('./handle-exit');
        if (this instanceof init) {
            console.error('\n', ' => Suman usage warning: no need to use "new" keyword with the suman.init()' +
                ' function as it is not a standard constructor');
            return init.apply(null, arguments);
        }
        if (!inBrowser) {
            assert(($module.constructor && $module.constructor.name === 'Module'), 'Please pass the test file module instance as first arg to suman.init()');
        }
        debugger;
        if (confOverride) {
            assert(confOverride && (typeof confOverride === 'object'), ' => Suman conf override value must be defined and an object.');
            assert(!Array.isArray(confOverride), ' => Suman conf override value must be an object, but not an array.');
            Object.assign(_suman.sumanConfig, confOverride);
        }
        _suman.sumanInitCalled = true;
        _suman.sumanInitStartDate = (_suman.sumanInitStartDate || Date.now());
        _suman._currentModule = $module.filename;
        _suman.SUMAN_TEST = 'yes';
        debug(' => Suman debug message => require.main.filename => ', '"' + require.main.filename + '"');
        debug(' => Suman debug message => suman index was required from module (module.parent) => ', module.parent.filename);
        if (module.parent && module.parent.parent) {
            debug(' => Suman debug message => (module.parent.parent) => ', module.parent.parent.filename);
        }
        if (module.parent && module.parent.parent && module.parent.parent.parent) {
            debug(' => Suman debug message => (module.parent.parent.parent) => ', module.parent.parent.parent.filename);
        }
        if (!loaded) {
        }
        if ($opts) {
            assert(typeof $opts === 'object' && !Array.isArray($opts), 'Please pass an options object as a second argument to suman.init()');
        }
        var matches = false;
        if (usingRunner) {
            if (process.env.SUMAN_CHILD_TEST_PATH === $module.filename) {
                matches = true;
            }
        }
        else {
            if (_suman.sumanOpts.vverbose) {
                console.log(' => Suman vverbose message => require.main.filename value:', main);
            }
            if (main === $module.filename) {
                matches = true;
            }
        }
        var opts = $opts || {};
        var series = !!opts.series;
        var writable = opts.writable;
        if ($module._sumanInitted) {
            console.error(' => Suman warning => suman.init() already called for this module with filename => ', $module.filename);
            return;
        }
        $module._sumanInitted = true;
        moduleCount++;
        var testSuiteQueue = $module.testSuiteQueue = [];
        suiteResultEmitter.on('suman-completed', function () {
            testSuiteQueue.pop();
            var fn;
            if (fn = testSuiteQueue[testSuiteQueue.length - 1]) {
                debug(' => Running testSuiteQueue fn => ', String(fn));
                fn.call(null);
            }
            else {
                debug(' => Suman testSuiteQueue is empty.');
            }
        });
        var exportEvents = $module.exports = (writable || Transform());
        exportEvents.counts = {
            sumanCount: 0
        };
        Object.defineProperty($module, 'exports', {
            writable: false
        });
        var integrants = opts.integrants || opts.pre || [];
        assert(Array.isArray(integrants), '"integrants" must be an array type.');
        integrants = integrants.filter(function (i) { return i; });
        if (opts.__expectedExitCode !== undefined && process.env.SUMAN_SINGLE_PROCESS !== 'yes') {
            var expectedExitCode = _suman.expectedExitCode = _suman.expectedExitCode || opts.__expectedExitCode;
            assert(Number.isInteger(expectedExitCode) && expectedExitCode > -1, ' => Suman usage error => Expected exit ' +
                'code not an acceptable integer.');
        }
        if (opts.timeout !== undefined && process.env.SUMAN_SINGLE_PROCESS !== 'yes') {
            var timeout = _suman.expectedTimeout = opts.timeout;
            assert(Number.isInteger(timeout) && timeout > 0, ' => Suman usage error => Expected timeout value ' +
                'is not an acceptable integer.');
            setTimeout(function () {
                console.log('\n', new Error('=> Suman test file has timed out -' +
                    ' "timeout" value passed to suman.init() has been reached exiting....').stack);
                process.exit(constants.EXIT_CODES.TEST_FILE_TIMEOUT);
            }, timeout);
        }
        var $oncePost = opts.post || [];
        assert(Array.isArray($oncePost), '"post" option must be an array type.');
        var waitForResponseFromRunnerRegardingPostList = $oncePost.length > 0;
        var waitForIntegrantResponses = integrants.length > 0;
        allOncePostKeys.push($oncePost);
        allOncePreKeys.push(integrants);
        var _interface = String(opts.interface).toUpperCase() === 'TDD' ? 'TDD' : 'BDD';
        var filenames = [
            $module.filename,
            require.resolve('./runner-helpers/run-child.js'),
            require.resolve('../cli.js')
        ];
        var exportTests = (opts.export === true || singleProc || _suman._sumanIndirect);
        var iocData = opts.iocData || opts.ioc || {};
        if (iocData) {
            try {
                assert(typeof iocData === 'object' && !Array.isArray(iocData), colors.red(' => Suman usage error => "ioc" property passed to suman.init() needs ' +
                    'to point to an object'));
            }
            catch (err) {
                console.log(err.stack);
                process.exit(constants.EXIT_CODES.IOC_PASSED_TO_SUMAN_INIT_BAD_FORM);
            }
        }
        if (exportTests) {
            if (process.env.SUMAN_DEBUG === 'yes' || _suman.sumanOpts.vverbose) {
                console.log(colors.magenta(' => Suman message => export option set to true.'));
            }
        }
        if (usingRunner) {
            _suman._writeTestError = function (data, options) {
                assert(typeof data === 'string', ' => Implementation error => data passed to ' +
                    '_writeTestError should already be in string format => \n' + util.inspect(data));
                options = options || {};
                assert(typeof options === 'object', ' => Options should be an object.');
                if (true || process.env.SUMAN_DEBUG === 'yes') {
                    fs.appendFileSync(testDebugLogPath, data);
                }
            };
            _suman._writeLog = function (data) {
                if (process.env.SUMAN_DEBUG === 'yes') {
                    fs.appendFileSync(testDebugLogPath, data);
                }
            };
        }
        else {
            if (process.env.SUMAN_SINGLE_PROCESS === 'yes') {
                fs.writeFileSync(testLogPath, '\n => [SUMAN_SINGLE_PROCESS mode] Next Suman run @' + new Date() +
                    '\n Test file => "' + $module.filename + '"', { flag: 'a' });
            }
            else {
                fs.writeFileSync(testLogPath, '\n\n => Test file => "' + $module.filename + '"\n\n', { flag: 'a' });
            }
            _suman._writeLog = function (data) {
                fs.appendFileSync(testLogPath, data);
            };
            _suman._writeTestError = function (data, ignore) {
                if (!ignore) {
                    _suman.checkTestErrorLog = true;
                }
                fs.appendFileSync(testDebugLogPath, '\n' + data + '\n');
            };
            fs.writeFileSync(testDebugLogPath, '\n\n', { flags: 'a', encoding: 'utf8' });
            _suman._writeTestError('\n\n', true);
            _suman._writeTestError(' ### Suman start run @' + new Date(), true);
            _suman._writeTestError(' ### Filename => ' + $module.filename, true);
            _suman._writeTestError(' ### Command => ' + JSON.stringify(process.argv), true);
        }
        var integrantsFn = null;
        var integrantsReady = null;
        var postOnlyReady = null;
        if (waitForIntegrantResponses || process.env.SUMAN_SINGLE_PROCESS === 'yes') {
            integrantsReady = false;
        }
        if (waitForResponseFromRunnerRegardingPostList) {
            postOnlyReady = false;
        }
        if (integrants.length < 1) {
            integrantsFn = function (emitter) {
                process.nextTick(function () {
                    if (emitter) {
                        emitter.emit('vals', {});
                    }
                    else {
                        integrantsEmitter.emit('vals', {});
                    }
                });
            };
        }
        else if (_suman.usingRunner) {
            integrantsFn = function () {
                var integrantsFromParentProcess = [];
                var oncePreVals = {};
                if (integrantsReady) {
                    process.nextTick(function () {
                        integrantsEmitter.emit('vals', oncePreVals);
                    });
                }
                else {
                    var integrantMessage_1 = function (msg) {
                        if (msg.info === 'integrant-ready') {
                            integrantsFromParentProcess.push(msg.data);
                            oncePreVals[msg.data] = msg.val;
                            if (su.checkForEquality(integrants, integrantsFromParentProcess)) {
                                integrantsReady = true;
                                if (postOnlyReady !== false) {
                                    process.removeListener('message', integrantMessage_1);
                                    integrantsEmitter.emit('vals', oncePreVals);
                                }
                            }
                        }
                        else if (msg.info === 'integrant-error') {
                            process.removeListener('message', integrantMessage_1);
                            integrantsEmitter.emit('error', msg);
                        }
                        else if (msg.info === 'once-post-received') {
                            postOnlyReady = true;
                            if (integrantsReady !== false) {
                                process.removeListener('message', integrantMessage_1);
                                integrantsEmitter.emit('vals', oncePreVals);
                            }
                        }
                    };
                    process.on('message', integrantMessage_1);
                    process.send({
                        type: constants.runner_message_type.INTEGRANT_INFO,
                        msg: integrants,
                        oncePost: $oncePost,
                        expectedExitCode: _suman.expectedExitCode,
                        expectedTimeout: _suman.expectedTimeout
                    });
                }
            };
        }
        else {
            integrantsFn = function (emitter) {
                integPreConfiguration =
                    (integPreConfiguration || integrantPreFn({ temp: 'we are in suman project => lib/index.js' }));
                var d = domain.create();
                d.once('error', function (err) {
                    err = new Error(' => Suman fatal error => there was a problem verifying the ' +
                        'integrants listed in test file "' + $module.filename + '"\n' + (err.stack || err));
                    fatalRequestReply({
                        type: constants.runner_message_type.FATAL,
                        data: {
                            msg: err,
                            stack: err
                        }
                    }, function () {
                        console.error(err.stack || err);
                        _suman._writeTestError(err.stack || err);
                        process.exit(constants.EXIT_CODES.INTEGRANT_VERIFICATION_FAILURE);
                    });
                });
                d.run(function () {
                    if (process.env.SUMAN_SINGLE_PROCESS === 'yes') {
                        acquireIntegrantsSingleProcess(integrants, integPreConfiguration, su.onceAsync(null, function (err, vals) {
                            d.exit();
                            process.nextTick(function () {
                                if (err) {
                                    emitter.emit('error', err);
                                }
                                else {
                                    emitter.emit('vals', vals);
                                }
                            });
                        }));
                    }
                    else {
                        acquireDeps(integrants, integPreConfiguration, su.onceAsync(null, function (err, vals) {
                            d.exit();
                            process.nextTick(function () {
                                if (err) {
                                    integrantsEmitter.emit('error', err);
                                }
                                else {
                                    integrantsEmitter.emit('vals', vals);
                                }
                            });
                        }));
                    }
                });
            };
        }
        var integrantsInvoked = false;
        init.tooLate = false;
        var start = function (desc, opts, arr, cb) {
            var args = pragmatik.parse(arguments, rules.createSignature);
            if (init.tooLate === true && process.env.SUMAN_SINGLE_PROCESS !== 'yes') {
                console.error(' => Suman usage fatal error => You must call Test.describe() synchronously => ' +
                    'in other words, all Test.describe() calls should be registered in the same tick of the event loop.');
                return process.exit(constants.EXIT_CODES.ASYNCHRONOUS_CALL_OF_TEST_DOT_DESCRIBE);
            }
            var sumanEvents = Transform();
            sumanEvents.on('test', function () {
                debug('SUMAN EVENTS test!');
                exportEvents.emit.bind(exportEvents, 'test').apply(exportEvents, arguments);
            });
            sumanEvents.on('error', function () {
                debug('SUMAN EVENTS error!');
                exportEvents.emit.bind(exportEvents, 'error').apply(exportEvents, arguments);
            });
            sumanEvents.on('suman-test-file-complete', function () {
                debug('SUMAN EVENTS suman-test-file-complete!');
                exportEvents.emit.bind(exportEvents, 'suman-test-file-complete').apply(exportEvents, arguments);
            });
            process.nextTick(function () {
                init.tooLate = true;
            });
            exportEvents.counts.sumanCount++;
            counts.sumanCount++;
            debug(' in index => exportEvents count =>', exportEvents.counts.sumanCount, ' => counts.sumanCount => ', counts.sumanCount);
            var to = setTimeout(function () {
                console.error(' => Suman usage error => Integrant acquisition timeout.');
                process.exit(constants.EXIT_CODES.INTEGRANT_ACQUISITION_TIMEOUT);
            }, _suman.weAreDebugging ? 50000000 : 50000);
            function onPreVals(vals) {
                clearTimeout(to);
                if (!inBrowser && !_suman.iocConfiguration || process.env.SUMAN_SINGLE_PROCESS === 'yes') {
                    iocData['suman.once.pre.js'] = vals;
                    _suman.userData = JSON.parse(JSON.stringify(iocData));
                    var iocFnArgs = fnArgs(iocFn);
                    var getiocFnDeps = makeIocDepInjections(iocData);
                    var iocFnDeps = getiocFnDeps(iocFnArgs);
                    _suman.iocConfiguration = iocFn.apply(null, iocFnDeps) || {};
                }
                else {
                    _suman.iocConfiguration = _suman.iocConfiguration || {};
                }
                makeSuman($module, _interface, true, sumanConfig, function (err, suman) {
                    if (err) {
                        _suman._writeTestError(err.stack || err);
                        return process.exit(constants.EXIT_CODES.ERROR_CREATED_SUMAN_OBJ);
                    }
                    if (process.env.SUMAN_SINGLE_PROCESS === 'yes') {
                        if (exportEvents.listenerCount('test') < 1) {
                            throw new Error(' => We are in "SUMAN_SINGLE_PROCESS" mode but nobody is listening for test events. ' +
                                'To run SUMAN_SINGLE_PROCESS mode you need to use the suman executable, not plain node.');
                        }
                    }
                    suman._sumanModulePath = $module.filename;
                    if (exportTests && matches) {
                        var $code_1 = constants.EXIT_CODES.EXPORT_TEST_BUT_RAN_TEST_FILE_DIRECTLY;
                        var msg = ' => Suman usage error => You have declared export:true in your suman.init call, ' +
                            'but ran the test directly.';
                        console.error(msg);
                        return fatalRequestReply({
                            type: constants.runner_message_type.FATAL,
                            data: {
                                error: msg,
                                msg: msg
                            }
                        }, function () {
                            _suman._writeTestError(' => Suman usage error => You have declared export:true in ' +
                                'your suman.init call, but ran the test directly.');
                            suman.logFinished(null, function () {
                                process.exit($code_1);
                            });
                        });
                    }
                    else {
                        suman._sumanEvents = sumanEvents;
                        var run_1 = es.main(suman);
                        try {
                            process.domain && process.domain.exit();
                        }
                        catch (err) {
                        }
                        global.setImmediate(function () {
                            if (exportTests === true) {
                                if (series) {
                                    var fn = function () {
                                        suman.extraArgs = Array.from(arguments);
                                        run_1.apply(null, args);
                                    };
                                    $module.testSuiteQueue.unshift(fn);
                                    sumanEvents.on('suman-test-file-complete', function () {
                                        testSuiteQueue.pop();
                                        var fn;
                                        if (fn = testSuiteQueue[testSuiteQueue.length - 1]) {
                                            sumanEvents.emit('test', fn);
                                        }
                                        else {
                                            console.error(colors.red.bold(' => Suman implementation error => Should not be empty.'));
                                        }
                                    });
                                    if ($module.testSuiteQueue.length === 1) {
                                        sumanEvents.emit('test', fn);
                                    }
                                }
                                else {
                                    sumanEvents.emit('test', function () {
                                        console.log('ARGUMENTS => ', arguments);
                                        suman.extraArgs = Array.from(arguments);
                                        run_1.apply(global, args);
                                    });
                                }
                                if (false && writable) {
                                    args.push([]);
                                    args.push(writable);
                                    run_1.apply(global, args);
                                }
                            }
                            else {
                                if (series) {
                                    var fn = function () {
                                        run_1.apply(null, args);
                                    };
                                    $module.testSuiteQueue.unshift(fn);
                                    if ($module.testSuiteQueue.length === 1) {
                                        fn.apply(null, args);
                                    }
                                }
                                else {
                                    run_1.apply(null, args);
                                }
                            }
                        });
                    }
                });
            }
            if (process.env.SUMAN_SINGLE_PROCESS !== 'yes') {
                integrantsEmitter.once('error', function (err) {
                    clearTimeout(to);
                    console.error(err.stack || err);
                    _suman._writeTestError(err.stack || err);
                    process.exit(constants.EXIT_CODES.INTEGRANT_VERIFICATION_ERROR);
                });
                integrantsEmitter.once('vals', onPreVals);
            }
            else {
                sumanEvents.once('vals', onPreVals);
            }
            process.nextTick(function () {
                if (!integrantsInvoked || (process.env.SUMAN_SINGLE_PROCESS === 'yes')) {
                    integrantsInvoked = true;
                    var emitter = (process.env.SUMAN_SINGLE_PROCESS === 'yes' ? sumanEvents : null);
                    debug('calling integrants fn');
                    integrantsFn(emitter);
                }
                else {
                    debug('integrantsInvoked more than once for non-SUMAN_SINGLE_PROCESS mode run', 'process.env.SUMAN_SINGLE_PROCESS => ' + process.env.SUMAN_SINGLE_PROCESS);
                }
            });
        };
        init.$ingletonian = {
            parent: $module.parent,
            file: _suman.sumanTestFile = $module.filename
        };
        start.skip = init.$ingletonian.skip = function () {
            var args = pragmatik.parse(arguments, rules.blockSignature);
            args[1].skip = true;
            start.apply(this, args);
        };
        start.only = init.$ingletonian.only = function () {
            var args = pragmatik.parse(arguments, rules.blockSignature);
            _suman.describeOnlyIsTriggered = true;
            args[1].only = true;
            start.apply(this, args);
        };
        start.delay = init.$ingletonian.delay = function () {
            var args = pragmatik.parse(arguments, rules.blockSignature);
            args[1].delay = true;
            start.apply(this, args);
        };
        var create = init.$ingletonian.create = start;
        _interface === 'TDD' ? init.$ingletonian.suite = create : init.$ingletonian.describe = create;
        loaded = true;
        return init.$ingletonian;
    };
    function Writable(type) {
        if (this instanceof Writable) {
            return Writable.apply(global, arguments);
        }
        var strm = new stream.Writable({
            write: function (chunk, encoding, cb) {
                console.log('index chunks:', String(chunk));
            }
        });
        strm.cork();
        return strm;
    }
    function Transform() {
        var BufferStream = function () {
            stream.Transform.apply(this, arguments);
            this.buffer = [];
        };
        util.inherits(BufferStream, stream.Transform);
        BufferStream.prototype._transform = function (chunk, encoding, done) {
            this.push(chunk ? String(chunk) : null);
            this.buffer.push(chunk ? String(chunk) : null);
            done();
        };
        BufferStream.prototype.pipe = function (destination, options) {
            var res = stream.Transform.prototype.pipe.apply(this, arguments);
            this.buffer.forEach(function (b) {
                res.write(String(b));
            });
            return res;
        };
        return new BufferStream();
    }
    function autoPass() {
        console.log(' => Suman auto pass function passthrough recorded, this is a no-op.');
    }
    function autoFail() {
        throw new Error('Suman auto-fail. Perhaps flesh-out this hook or test to get it passing.');
    }
    function once(fn) {
        var cache = null;
        return function (cb) {
            if (cache) {
                process.nextTick(function () {
                    cb.call(null, null, cache);
                });
            }
            else {
                fn.call(null, function (err, val) {
                    if (!err) {
                        cache = val || {
                            'Suman says': 'This is a dummy-cache val. ' +
                                'See => sumanjs.github.io/tricks-and-tips.html'
                        };
                    }
                    cb.apply(null, arguments);
                });
            }
        };
    }
    function load(opts) {
        if (typeof opts !== 'object') {
            throw new Error(' => Suman usage error => Please pass in an options object to the suman.load() function.');
        }
        var pth = opts.path;
        var indirect = !!opts.indirect;
        assert(path.isAbsolute(pth), ' => Suman usage error => Please pass in an absolute path to suman.load() function.');
        _suman._sumanIndirect = indirect;
        var exp = require(pth);
        _suman._sumanIndirect = null;
        return exp;
    }
    var suman = {
        load: load,
        autoPass: autoPass,
        autoFail: autoFail,
        init: init,
        constants: constants,
        Writable: Writable,
        Transform: Transform,
        once: once
    };
    try {
        window.suman = suman;
        console.log(' => "suman" is now available as a global variable in the browser.');
    }
    catch (err) {
    }
    return suman;
});
define("lib/make-test-suite", ["require", "exports"], function (require, exports) {
    'use strict';
    Object.defineProperty(exports, "__esModule", { value: true });
    var process = require('suman-browser-polyfills/modules/process');
    var global = require('suman-browser-polyfills/modules/global');
    var domain = require('domain');
    var util = require('util');
    var assert = require('assert');
    var fnArgs = require('function-arguments');
    var pragmatik = require('pragmatik');
    var _ = require('underscore');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var rules = require('./helpers/handle-varargs');
    var implementationError = require('./helpers/implementation-error');
    var constants = require('../config/suman-constants');
    var sumanUtils = require('suman-utils');
    var freezeExistingProps = require('./freeze-existing');
    var originalAcquireDeps = require('./acquire-deps-original');
    var startSuite = require('./test-suite-helpers/start-suite');
    var makeTestSuiteBase = require('./make-test-suite-base');
    var makeHandleBeforesAndAfters = require('./test-suite-helpers/make-handle-befores-afters');
    var makeNotifyParent = require('./test-suite-helpers/notify-parent-that-child-is-complete');
    var makeIt = require('./test-suite-methods/make-it');
    var makeAfter = require('./test-suite-methods/make-after');
    var makeAfterEach = require('./test-suite-methods/make-after-each');
    var makeBeforeEach = require('./test-suite-methods/make-before-each');
    var makeBefore = require('./test-suite-methods/make-before');
    var makeInject = require('./test-suite-methods/make-inject');
    var makeDescribe = require('./test-suite-methods/make-describe');
    function makeRunChild(val) {
        return function runChild(child, cb) {
            child._run(val, cb);
        };
    }
    function makeTestSuiteMaker(suman, gracefulExit) {
        var allDescribeBlocks = suman.allDescribeBlocks;
        var _interface = String(suman.interface).toUpperCase() === 'TDD' ? 'TDD' : 'BDD';
        var TestSuiteBase = makeTestSuiteBase(suman);
        var handleBeforesAndAfters = makeHandleBeforesAndAfters(suman, gracefulExit);
        var notifyParentThatChildIsComplete = makeNotifyParent(suman, gracefulExit, handleBeforesAndAfters);
        var TestSuiteMaker = function (data) {
            var it, describe, before, after, beforeEach, afterEach, inject;
            var TestSuite = function (obj) {
                this.interface = suman.interface;
                this.desc = this.title = obj.desc;
                this.timeout = function () {
                    console.error(' => this.timeout is not implemented yet.');
                };
                this.slow = function () {
                    console.error(' => this.slow is not implemented yet.');
                };
                var zuite = this;
                this.resume = function () {
                    var args = Array.from(arguments);
                    process.nextTick(function () {
                        zuite.__resume.apply(zuite, args);
                    });
                };
                inject = this.inject = makeInject(suman, zuite);
                before = makeBefore(suman, zuite);
                _interface === 'TDD' ? this.setup = before : this.before = before;
                after = makeAfter(suman, zuite);
                _interface === 'TDD' ? this.teardown = after : this.after = after;
                beforeEach = makeBeforeEach(suman, zuite);
                _interface === 'TDD' ? this.setupTest = beforeEach : this.beforeEach = beforeEach;
                afterEach = makeAfterEach(suman, zuite);
                _interface === 'TDD' ? this.teardownTest = afterEach : this.afterEach = afterEach;
                it = makeIt(suman, zuite);
                _interface === 'TDD' ? this.test = it : this.it = it;
                describe = this.context = makeDescribe(suman, gracefulExit, TestSuiteMaker, zuite, notifyParentThatChildIsComplete);
                _interface === 'TDD' ? this.suite = describe : this.describe = describe;
            };
            TestSuite.prototype = Object.create(new TestSuiteBase(data));
            TestSuite.prototype.__bindExtras = function bindExtras() {
                var ctx = this;
                describe.delay =
                    function (desc, opts, arr, fn) {
                        var args = pragmatik.parse(arguments, rules.blockSignature);
                        args[1].delay = true;
                        args[1].__preParsed = true;
                        describe.apply(ctx, args);
                    };
                describe.skip =
                    function (desc, opts, arr, fn) {
                        var args = pragmatik.parse(arguments, rules.blockSignature);
                        args[1].skip = true;
                        args[1].__preParsed = true;
                        describe.apply(ctx, args);
                    };
                describe.only =
                    function (desc, opts, arr, fn) {
                        suman.describeOnlyIsTriggered = true;
                        var args = pragmatik.parse(arguments, rules.blockSignature);
                        args[1].only = true;
                        args[1].__preParsed = true;
                        describe.apply(ctx, args);
                    };
                describe.skip.delay = describe.delay.skip = describe.skip;
                describe.only.delay = describe.delay.only =
                    function (desc, opts, arr, fn) {
                        suman.describeOnlyIsTriggered = true;
                        var args = pragmatik.parse(arguments, rules.blockSignature);
                        args[1].only = true;
                        args[1].__preParsed = true;
                        describe.apply(ctx, args);
                    };
                it.skip =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.testCaseSignature);
                        args[1].skip = true;
                        args[1].__preParsed = true;
                        return it.apply(ctx, args);
                    };
                it.only =
                    function (desc, opts, fn) {
                        suman.itOnlyIsTriggered = true;
                        var args = pragmatik.parse(arguments, rules.testCaseSignature);
                        args[1].only = true;
                        args[1].__preParsed = true;
                        return it.apply(ctx, args);
                    };
                it.only.cb =
                    function (desc, opts, fn) {
                        suman.itOnlyIsTriggered = true;
                        var args = pragmatik.parse(arguments, rules.testCaseSignature);
                        args[1].only = true;
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return it.apply(ctx, args);
                    };
                it.skip.cb =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.testCaseSignature);
                        args[1].skip = true;
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return it.apply(ctx, args);
                    };
                it.cb =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.testCaseSignature);
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return it.apply(ctx, args);
                    };
                it.cb.skip = it.skip.cb;
                it.cb.only = it.only.cb;
                inject.cb =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return inject.apply(ctx, args);
                    };
                inject.skip =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].skip = true;
                        args[1].__preParsed = true;
                        return inject.apply(ctx, args);
                    };
                inject.skip.cb = inject.cb.skip = inject.skip;
                before.cb =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return before.apply(ctx, args);
                    };
                before.skip =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].skip = true;
                        args[1].__preParsed = true;
                        return before.apply(ctx, args);
                    };
                before.skip.cb = before.cb.skip = before.skip;
                after.cb =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].cb = true;
                        args[1].__preParsed = true;
                        return after.apply(ctx, args);
                    };
                after.skip =
                    function (desc, opts, fn) {
                        var args = pragmatik.parse(arguments, rules.hookSignature);
                        args[1].skip = true;
                        args[1].__preParsed = true;
                        return after.apply(ctx, args);
                    };
                after.skip.cb = after.cb.skip = after.skip;
                beforeEach.cb = function (desc, opts, fn) {
                    var args = pragmatik.parse(arguments, rules.hookSignature);
                    args[1].cb = true;
                    args[1].__preParsed = true;
                    return beforeEach.apply(ctx, args);
                };
                beforeEach.skip = function (desc, opts, fn) {
                    var args = pragmatik.parse(arguments, rules.hookSignature);
                    args[1].skip = true;
                    args[1].__preParsed = true;
                    return beforeEach.apply(ctx, args);
                };
                beforeEach.skip.cb = beforeEach.cb.skip = beforeEach.skip;
                afterEach.cb = function (desc, opts, fn) {
                    var args = pragmatik.parse(arguments, rules.hookSignature);
                    args[1].cb = true;
                    args[1].__preParsed = true;
                    return afterEach.apply(ctx, args);
                };
                afterEach.skip = function (desc, opts, fn) {
                    var args = pragmatik.parse(arguments, rules.hookSignature);
                    args[1].skip = true;
                    args[1].__preParsed = true;
                    return afterEach.apply(ctx, args);
                };
                afterEach.skip.cb = afterEach.cb.skip = afterEach.skip;
            };
            TestSuite.prototype.__invokeChildren = function (val, start) {
                var testIds = _.pluck(this.getChildren(), 'testId');
                var children = allDescribeBlocks.filter(function (test) {
                    return _.contains(testIds, test.testId);
                });
                async.eachSeries(children, makeRunChild(val), start);
            };
            TestSuite.prototype.toString = function () {
                return this.constructor + ':' + this.desc;
            };
            TestSuite.prototype.log = function () {
                console.log.apply(console, [' [TESTSUITE LOGGER ] => '].concat(Array.from(arguments)));
            };
            TestSuite.prototype.series = function (cb) {
                if (typeof cb === 'function') {
                    cb.apply(this, [(_interface === 'TDD' ? this.test : this.it).bind(this)]);
                }
                return this;
            };
            TestSuite.prototype.__startSuite = startSuite(suman, gracefulExit, handleBeforesAndAfters, notifyParentThatChildIsComplete);
            freezeExistingProps(TestSuite.prototype);
            return freezeExistingProps(new TestSuite(data));
        };
        return TestSuiteMaker;
    }
    module.exports = makeTestSuiteMaker;
});
define("lib/cli-commands/install-global-deps", ["require", "exports"], function (require, exports) {
    'use strict';
    var cp = require('child_process');
    var path = require('path');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var p = path.resolve(process.env.HOME + '/.suman/global');
    return function (deps) {
        if (deps.length < 1) {
            console.log('\n');
            console.log(colors.magenta(' => No dependency names passed at command line.'));
            console.log(' => Try this instead: "$ suman --install-globals <dep-name0> <dep-name1> <dep-nameX> "');
            return process.exit(1);
        }
        async.mapSeries(deps, function (d, cb) {
            console.log('\n');
            console.log(' => Suman is now installing the following global dep => ', d);
            var k = cp.spawn('bash', [], {
                cwd: p
            });
            k.stdout.pipe(process.stdout);
            k.stderr.pipe(process.stderr);
            k.once('close', function (code) {
                cb(undefined, {
                    name: d,
                    code: code
                });
            });
            var cmd = "npm install -S " + d + " --only=production";
            k.stdin.write('\n' + cmd + '\n');
            k.stdin.end();
        }, function (err, results) {
            if (err) {
                return console.error(err);
            }
            console.log('\n');
            console.log('=> Suman installation results:');
            console.log('\n');
            var allGood = true;
            results.forEach(function (r) {
                console.log(r);
                if (r.code > 0) {
                    allGood = false;
                    console.log(' => ', r.name, 'may not have been installed successfully.');
                }
            });
            if (allGood) {
                console.log('\n');
                console.log(' => All deps installed successfully.');
                process.exit(0);
            }
            else {
                console.log('\n');
                console.log(' => Some deps may *not* have been installed successfully.');
                process.exit(1);
            }
        });
    };
});
'use strict';
var cp = require('child_process');
var path = require('path');
var fs = require('fs');
var colors = require('colors/safe');
var _suman = global.__suman = (global.__suman || {});
var script = path.resolve(__dirname + '/../../scripts/suman-postinstall.sh');
console.log('\n');
console.log(' => Suman will run its postinstall routine.');
console.log('\n');
var k = cp.spawn(script);
k.stdout.pipe(process.stdout);
k.stderr.pipe(process.stderr);
k.once('close', function (code) {
    process.exit(code || 0);
});
define("lib/cli-commands/run-diagnostics", ["require", "exports"], function (require, exports) {
    'use strict';
    var path = require('path');
    var semver = require('semver');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var constants = require('../../config/suman-constants');
    return function (cb) {
        console.log(' => NODE_PATH => ', process.env.NODE_PATH);
        var deps = [];
        Object.keys(constants.SUMAN_GLOBAL_DEPS).forEach(function (k) {
            deps = deps.concat(constants.SUMAN_GLOBAL_DEPS[k]);
        });
        var reinstallThese = [];
        deps.forEach(function (obj) {
            Object.keys(obj).forEach(function (k) {
                var version = obj[k];
                var resolved = false;
                try {
                    console.log('Attempting to require => ', k);
                    require.resolve(k);
                    resolved = true;
                }
                catch (err) {
                    console.log(err.stack || err);
                    if (resolved === false) {
                        var dep = {};
                        dep[k] = version;
                        reinstallThese.push(dep);
                    }
                }
            });
        });
        console.log('\n');
        console.log(colors.magenta(' => Suman diagnostics suggests the following deps need to be re-installed => '), '\n', reinstallThese);
        if (cb) {
            cb();
        }
        else {
            process.exit(0);
        }
    };
});
define("lib/test-suite-methods/make-after-each", ["require", "exports"], function (require, exports) {
    'use strict';
    var domain = require('domain');
    var util = require('util');
    var pragmatik = require('pragmatik');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var rules = require('../helpers/handle-varargs');
    var implementationError = require('../helpers/implementation-error');
    var constants = require('../../config/suman-constants');
    var sumanUtils = require('suman-utils');
    var handleSetupComplete = require('../handle-setup-complete');
    function handleBadOptions(opts) {
        if (opts.plan !== undefined && !Number.isInteger(opts.plan)) {
            console.error(' => Suman usage error => "plan" option is not an integer.');
            process.exit(constants.EXIT_CODES.OPTS_PLAN_NOT_AN_INTEGER);
            return;
        }
    }
    return function (suman, zuite) {
        return function ($desc, $opts, $aAfterEach) {
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
                zuite.getAfterEaches().push({
                    ctx: zuite,
                    timeout: opts.timeout || 11000,
                    desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                    cb: opts.cb || false,
                    throws: opts.throws,
                    planCountExpected: opts.plan,
                    fatal: !(opts.fatal === false),
                    fn: fn,
                    type: 'afterEach/teardownTest',
                    warningErr: new Error('SUMAN_TEMP_WARNING_ERROR')
                });
            }
            return zuite;
        };
    };
});
define("lib/test-suite-methods/make-after", ["require", "exports"], function (require, exports) {
    'use strict';
    var process = require('suman-browser-polyfills/modules/process');
    var global = require('suman-browser-polyfills/modules/global');
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
    return function (suman, zuite) {
        return function ($desc, $opts, $fn) {
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
});
define("lib/test-suite-methods/make-before-each", ["require", "exports"], function (require, exports) {
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
    return function (suman, zuite) {
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
});
define("lib/test-suite-methods/make-before", ["require", "exports"], function (require, exports) {
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
    return function (suman, zuite) {
        return function ($desc, $opts, $fn) {
            handleSetupComplete(zuite);
            var args = pragmatik.parse(arguments, rules.hookSignature, {
                preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
            });
            var desc = args[0], opts = args[1], fn = args[2];
            handleBadOptions(opts);
            desc = desc || fn ? fn.name : '(unknown name)';
            if (opts.skip) {
                suman.numHooksSkipped++;
            }
            else if (!fn) {
                suman.numHooksStubbed++;
            }
            else {
                zuite.getBefores().push({
                    ctx: zuite,
                    desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                    timeout: opts.timeout || 11000,
                    cb: opts.cb || false,
                    throws: opts.throws,
                    planCountExpected: opts.plan,
                    fatal: !(opts.fatal === false),
                    fn: fn,
                    timeOutError: new Error('*timed out* - did you forget to call done/ctn/fatal()?'),
                    type: 'before/setup',
                    warningErr: new Error('SUMAN_TEMP_WARNING_ERROR')
                });
            }
            return zuite;
        };
    };
});
define("lib/test-suite-methods/make-describe", ["require", "exports"], function (require, exports) {
    'use strict';
    var process = require('suman-browser-polyfills/modules/process');
    var global = require('suman-browser-polyfills/modules/global');
    var domain = require('domain');
    var util = require('util');
    var assert = require('assert');
    var fnArgs = require('function-arguments');
    var pragmatik = require('pragmatik');
    var _ = require('underscore');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var rules = require('../helpers/handle-varargs');
    var constants = require('../../config/suman-constants');
    var sumanUtils = require('suman-utils');
    var originalAcquireDeps = require('../acquire-deps-original');
    var handleSetupComplete = require('../handle-setup-complete');
    var makeAcquireDepsFillIn = require('../acquire-deps-fill-in');
    var handleInjections = require('../handle-injections');
    function handleBadOptions(opts) {
        return;
    }
    return function (suman, gracefulExit, TestSuiteMaker, zuite, notifyParentThatChildIsComplete) {
        var acquireDepsFillIn = makeAcquireDepsFillIn(suman);
        var allDescribeBlocks = suman.allDescribeBlocks;
        return function ($desc, $opts, $arr, $cb) {
            handleSetupComplete(zuite);
            var args = pragmatik.parse(arguments, rules.blockSignature, {
                preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
            });
            var desc = args[0], opts = args[1], arr = args[2], cb = args[3];
            handleBadOptions(opts);
            if (arr && cb) {
                throw new Error(' => Please define either an array or callback, but not both.');
            }
            var arrayDeps;
            if (arr) {
                cb = arr[arr.length - 1];
                assert.equal(typeof cb, 'function', ' => Suman usage error => ' +
                    'You need to pass a function as the last argument to the array.');
                arr.splice(-1, 1);
                arrayDeps = arr.map(function (item) {
                    return String(item);
                });
            }
            arrayDeps = arrayDeps || [];
            if (arrayDeps.length > 0) {
                var preVal_1 = [];
                arrayDeps.forEach(function (a) {
                    if (/:/.test(a)) {
                        preVal_1.push(a);
                    }
                });
                var toEval = ['(function(){return {', preVal_1.join(','), '}}()'];
                var obj = eval(toEval.join(''));
                Object.assign(opts, obj);
            }
            var allowArrowFn = _suman.sumanConfig.allowArrowFunctionsForTestBlocks;
            var isArrow = sumanUtils.isArrowFunction(cb);
            var isGenerator = sumanUtils.isGeneratorFn(cb);
            var isAsync = sumanUtils.isAsyncFn(cb);
            if ((isArrow && !allowArrowFn) || isGenerator || isAsync) {
                var msg = constants.ERROR_MESSAGES.INVALID_FUNCTION_TYPE_USAGE;
                console.log('\n\n' + msg + '\n\n');
                console.error(new Error(' => Suman usage error => invalid arrow/generator function usage.').stack);
                process.exit(constants.EXIT_CODES.INVALID_ARROW_FUNCTION_USAGE);
                return;
            }
            if (zuite.parallel && opts.parallel === false) {
                console.log('\n => Suman warning => parent block ("' + zuite.desc + '") is parallel, ' +
                    'so child block ("' + desc + '") will be run in parallel with other sibling blocks.');
                console.log('\n => Suman warning => To see more info on this, visit: sumanjs.github.io\n\n');
            }
            if (zuite.skipped) {
                var msg = ' => Suman implementation warning => Child suite entered when parent was skipped.';
                console.error(msg);
                console.error(' => Please open an issue with the following stacktrace:', '\n');
                console.error(new Error(msg).stack);
            }
            if (opts.skip || zuite.skipped || (!opts.only && suman.describeOnlyIsTriggered)) {
                suman.numBlocksSkipped++;
                return;
            }
            var suite = TestSuiteMaker({
                desc: desc,
                title: desc,
                opts: opts
            });
            suite.skipped = opts.skip || zuite.skipped;
            if (!suite.only && suman.describeOnlyIsTriggered) {
                suite.skipped = suite.skippedDueToDescribeOnly = true;
            }
            suite.parent = _.pick(zuite, 'testId', 'desc', 'title', 'parallel');
            zuite.getChildren().push({ testId: suite.testId });
            allDescribeBlocks.push(suite);
            var deps = fnArgs(cb);
            var suiteProto = Object.getPrototypeOf(suite);
            suiteProto._run = function run(val, callback) {
                if (zuite.skipped || zuite.skippedDueToDescribeOnly) {
                    throw new Error(' => Suman implementation error, this code should not be reached.');
                    return process.nextTick(callback);
                }
                var d = domain.create();
                d.once('error', function (err) {
                    if (_suman.weAreDebugging) {
                        console.error(err.stack || err);
                    }
                    console.log(' => Error executing test block => ', err.stack);
                    err.sumanExitCode = constants.EXIT_CODES.ERROR_IN_CHILD_SUITE;
                    gracefulExit(err);
                });
                d.run(function () {
                    suite.getResumeValue = function () {
                        return val;
                    };
                    suite.__bindExtras();
                    originalAcquireDeps(deps, function (err, deps) {
                        if (err) {
                            console.log(err.stack || err);
                            process.exit(constants.EXIT_CODES.ERROR_ACQUIRING_IOC_DEPS);
                        }
                        else {
                            process.nextTick(function () {
                                var $deps;
                                try {
                                    $deps = acquireDepsFillIn(suite, zuite, deps);
                                }
                                catch (err) {
                                    console.error(err.stack || err);
                                    return gracefulExit(err);
                                }
                                suite.fatal = function (err) {
                                    err = err || new Error(' => suite.fatal() was called by the developer => fatal unspecified error.');
                                    console.log(err.stack || err);
                                    err.sumanExitCode = constants.EXIT_CODES.ERROR_PASSED_AS_FIRST_ARG_TO_DELAY_FUNCTION;
                                    gracefulExit(err);
                                };
                                var delayOptionElected = !!opts.delay;
                                if (!delayOptionElected) {
                                    suiteProto.__resume = function () {
                                        console.error('\n', ' => Suman usage warning => suite.resume() has become a noop since delay option is falsy.');
                                    };
                                    cb.apply(suite, $deps);
                                    handleInjections(suite, function (err) {
                                        if (err) {
                                            console.error(err.stack || err);
                                            gracefulExit(err);
                                        }
                                        else {
                                            d.exit();
                                            suiteProto.isSetupComplete = true;
                                            process.nextTick(function () {
                                                zuite.__bindExtras();
                                                suite.__invokeChildren(null, callback);
                                            });
                                        }
                                    });
                                }
                                else {
                                    suiteProto.isDelayed = true;
                                    var str_1 = cb.toString();
                                    if (!sumanUtils.checkForValInStr(str_1, /resume/g, 0)) {
                                        process.nextTick(function () {
                                            console.error(new Error(' => Suman usage error => delay option was elected, so suite.resume() ' +
                                                'method needs to be called to continue,' +
                                                ' but the resume method was never referenced in the needed location, so your test cases would ' +
                                                'never be invoked before timing out => \n\n' + str_1).stack);
                                            process.exit(constants.EXIT_CODES.DELAY_NOT_REFERENCED);
                                        });
                                        return;
                                    }
                                    var to_1 = setTimeout(function () {
                                        console.error('\n\n => Suman fatal error => delay function was not called within alloted time.');
                                        process.exit(constants.EXIT_CODES.DELAY_FUNCTION_TIMED_OUT);
                                    }, 11000);
                                    var callable_1 = true;
                                    suiteProto.__resume = function (val) {
                                        if (callable_1) {
                                            callable_1 = false;
                                            clearTimeout(to_1);
                                            d.exit();
                                            process.nextTick(function () {
                                                suiteProto.isSetupComplete = true;
                                                zuite.__bindExtras();
                                                suite.__invokeChildren(val, callback);
                                            });
                                        }
                                        else {
                                            var w = ' => Suman usage warning => suite.resume() was called more than once.';
                                            console.error(w);
                                            _suman._writeTestError(w);
                                        }
                                    };
                                    cb.apply(suite, $deps);
                                }
                            });
                        }
                    });
                });
            };
        };
    };
});
define("lib/test-suite-methods/make-inject", ["require", "exports"], function (require, exports) {
    'use strict';
    var domain = require('domain');
    var util = require('util');
    var pragmatik = require('pragmatik');
    var _ = require('underscore');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var rules = require('../helpers/handle-varargs');
    var constants = require('../../config/suman-constants');
    var handleSetupComplete = require('../handle-setup-complete');
    function handleBadOptions(opts) {
    }
    return function (suman, zuite) {
        return function ($desc, $opts, $fn) {
            handleSetupComplete(zuite);
            var args = pragmatik.parse(arguments, rules.hookSignature, {
                preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
            });
            var desc = args[0], opts = args[1], fn = args[2];
            handleBadOptions(opts);
            if (opts.skip) {
                _suman._writeTestError(' => Warning => Inject hook was skipped.');
            }
            else if (!fn) {
                _suman._writeTestError(' => Warning => Inject hook was stubbed.');
            }
            else {
                zuite.getInjections().push({
                    ctx: zuite,
                    desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                    timeout: opts.timeout || 11000,
                    cb: opts.cb || false,
                    throws: opts.throws,
                    planCountExpected: opts.plan,
                    fatal: !(opts.fatal === false),
                    fn: fn,
                    timeOutError: new Error('*timed out* - did you forget to call done/ctn/fatal()?'),
                    type: 'inject',
                    warningErr: new Error('SUMAN_TEMP_WARNING_ERROR')
                });
            }
            return zuite;
        };
    };
});
define("lib/test-suite-methods/make-it", ["require", "exports"], function (require, exports) {
    'use strict';
    var domain = require('domain');
    var util = require('util');
    var pragmatik = require('pragmatik');
    var _ = require('underscore');
    var async = require('async');
    var colors = require('colors/safe');
    var _suman = global.__suman = (global.__suman || {});
    var rules = require('../helpers/handle-varargs');
    var constants = require('../../config/suman-constants');
    var incr = require('../incrementer');
    var handleSetupComplete = require('../handle-setup-complete');
    function handleBadOptions(opts) {
    }
    return function (suman, zuite) {
        return function ($desc, $opts, $fn) {
            handleSetupComplete(zuite);
            var args = pragmatik.parse(arguments, rules.testCaseSignature, {
                preParsed: typeof $opts === 'object' ? $opts.__preParsed : null
            });
            var desc = args[0], opts = args[1], fn = args[2];
            handleBadOptions(opts);
            if (!fn) {
                zuite.getTests().push({ testId: incr(), desc: desc, stubbed: true });
                return zuite;
            }
            desc = desc || fn.name;
            if (opts.skip) {
                zuite.getTests().push({ testId: incr(), desc: desc, skipped: true });
                return zuite;
            }
            if (suman.itOnlyIsTriggered && !opts.only) {
                zuite.getTests().push({ testId: incr(), desc: desc, skipped: true, skippedDueToItOnly: true });
                return zuite;
            }
            if (opts.plan !== undefined && !Number.isInteger(opts.plan)) {
                console.error(' => Suman usage error => "plan" option is not an integer.');
                process.exit(constants.EXIT_CODES.OPTS_PLAN_NOT_AN_INTEGER);
                return;
            }
            if (opts.hasOwnProperty('parallel')) {
                if (opts.hasOwnProperty('mode')) {
                    console.log(' => Suman warning => Used both parallel and mode options => mode will take precedence.');
                    if (opts.mode !== 'parallel' && opts.mode !== 'series' && opts.mode !== 'serial') {
                        console.log(' => Suman warning => valid "môde" options are only values of "parallel" or "series" or "serial"' +
                            ' => ("serial" is an alias to "series").');
                    }
                }
            }
            var testData = {
                testId: incr(),
                stubbed: false,
                data: {},
                planCountExpected: opts.plan,
                originalOpts: opts,
                only: opts.only,
                skip: opts.skip,
                value: opts.value,
                throws: opts.throws,
                parallel: (opts.parallel === true || opts.mode === 'parallel'),
                mode: opts.mode,
                delay: opts.delay,
                cb: opts.cb,
                type: 'it-standard',
                timeout: opts.timeout || 20000,
                desc: desc || (fn ? fn.name : '(unknown due to stubbed function)'),
                fn: fn,
                warningErr: new Error('SUMAN_TEMP_WARNING_ERROR'),
                timedOut: false,
                complete: false,
                error: null
            };
            if (opts.parallel || (zuite.parallel && opts.parallel !== false)) {
                zuite.getParallelTests().push(testData);
            }
            else {
                zuite.getTests().push(testData);
            }
            return zuite;
        };
    };
});
define("node_modules/node-check-fast/index", ["require", "exports"], function (require, exports) {
    "use strict";
    var async = require('async');
    var cp = require('child_process');
    var assert = require('assert');
    var os = require('os');
    var path = require('path');
    var util = require('util');
    var colors = require('colors/safe');
    var flattenDeep = require('lodash.flattendeep');
    var cpuCount = os.cpus().length || 2;
    return function (opts, cb) {
        var root = opts.root || process.cwd();
        assert(path.isAbsolute(root), ' => node-check-fast => Root must be an absolute path.');
        var paths = opts.paths || ['*.js'];
        assert(Array.isArray(paths), '  => node-check-fast => "path" must be an array.');
        var notPaths = opts.notPaths || ['**/node_modules/**'];
        assert(Array.isArray(notPaths), ' => node-check-fast => "notPaths" must be an array.');
        var maxDepth = opts.maxDepth || 12;
        assert(Number.isInteger(maxDepth), '  => node-check-fast => "maxDepth" must be an integer.');
        var concurrency = opts.concurrency || cpuCount;
        assert(Number.isInteger(concurrency), ' => "concurrency" option must be an integer.');
        function checkAll(files) {
            async.mapLimit(files, concurrency, function (f, cb) {
                var k = cp.spawn('bash');
                var cmd = ['node', '-c', "\'" + f + "\'"].join(' ');
                k.stdin.write('\n' + cmd + '\n');
                process.nextTick(function () {
                    k.stdin.end();
                });
                k.once('close', function (code) {
                    if (code < 1 && opts.verbosity > 1) {
                        console.log(' => The following file was processed with no syntax errors => \n', f);
                    }
                    cb(code && new Error('Exit code of "node -c" child process was greater than 0 for file => "' + f + '"'), { code: code, file: f });
                });
            }, function (err, results) {
                if (cb) {
                    cb(err, results);
                }
                else {
                    results = results.filter(function (r) {
                        return r.code > 0;
                    });
                    if (err) {
                        process.stderr.write('\n => Not all files were necessarily run, because we may have exited early..because:');
                        process.stderr.write('\n ' + colors.red.bold(' => Node check failed for at least one file:') + '\n' + util.inspect(results) + '\n\n');
                        process.exit(1);
                    }
                    else {
                        console.log(' => ', files.length, ' files checked with "node -c" for directory => "' + root + '",\n' +
                            colors.green.bold('...and congratulations there appear to be 0 syntax errors.'));
                        process.exit(0);
                    }
                }
            });
        }
        var $base = ['find', "" + root].join(' ');
        var $maxD = ['-maxdepth', "" + maxDepth].join(' ');
        var $typeF = ['-type f'];
        var $path = paths.map(function (p) {
            return ' -path \"' + String(p).trim() + '\" ';
        });
        var $notPath = notPaths.map(function (p) {
            return ' -not -path \"' + String(p).trim() + '\" ';
        });
        if (opts.verbosity > 2) {
            console.log(' => node-check-fast verbose => "--path" option contents => ', util.inspect($path));
            console.log(' => node-check-fast verbose => "--not-path" option contents => ', util.inspect($notPath));
        }
        var cmd = flattenDeep([$base, $maxD, $typeF, $path, $notPath]).join(' ');
        var k = cp.spawn('bash');
        k.stdin.write('\n' + cmd + '\n');
        process.nextTick(function () {
            k.stdin.end();
        });
        k.stdout.setEncoding('utf8');
        k.stderr.setEncoding('utf8');
        var stdout = '';
        k.stdout.on('data', function (data) {
            stdout += data;
        });
        var stderr = '';
        k.stderr.on('data', function (d) {
            stderr += d;
        });
        k.once('close', function (code) {
            if (code > 0) {
                var err = 'Error: find command failed - \n' + cmd + '\n' + stderr;
                if (cb) {
                    cb(err, []);
                }
                else {
                    process.stderr.write(err);
                    process.exit(1);
                }
            }
            else {
                var files = String(stdout).trim().split('\n').filter(function (l) { return l; });
                if (files.length < 1) {
                    if (cb) {
                        cb(null, []);
                    }
                    else {
                        process.stderr.write('No files found.');
                        process.exit(1);
                    }
                }
                else {
                    checkAll(files);
                }
            }
        });
    };
});
'use strict';
var assert = require('assert');
var util = require('util');
var debug = require('debug')('pragmatik');
var fnargs = require('function-arguments');
var types = [
    'object',
    'array',
    'integer',
    'number',
    'string',
    'boolean',
    'null',
    'undefined',
    'function'
];
function signature(r) {
    assert(Array.isArray(r.args), ' => "Pragmatik" usage error => Please define an "args" array property in your definition object.');
    var errors = [];
    var args = r.args;
    args.forEach(function (item, index, arr) {
        assert(types.indexOf(item.type) >= 0, 'Your item type is wrong or undefined, for rule => \n\n' + util.inspect(item)
            + '\n\nin the following definition => \n' + util.inspect(r) + '\n\n');
        if (index > 0) {
            var prior = arr[index - 1];
            var priorRequired = prior.required;
            if (!priorRequired) {
                if (prior.type === item.type) {
                    errors.push('Two adjacent fields are of the same type, and the preceding argument' +
                        '(leftmost) is not required which is problematic => '
                        + '\n => arg index => ' + (index - 1) + ' => ' + util.inspect(prior)
                        + '\n => arg index => ' + index + ' => ' + util.inspect(item));
                }
            }
        }
        if (index > 1) {
            if (!item.required) {
                var matched = false;
                var matchedIndex = null;
                var currentIndex = index - 2;
                while (currentIndex >= 0) {
                    var rule = args[currentIndex];
                    if (rule.type === item.type && !rule.required) {
                        matched = true;
                        matchedIndex = currentIndex;
                        break;
                    }
                    currentIndex--;
                }
                if (matched) {
                    currentIndex++;
                    var ok = false;
                    while (currentIndex < index) {
                        var rule = args[currentIndex];
                        if (rule.required) {
                            ok = true;
                            break;
                        }
                        currentIndex++;
                    }
                    if (!ok) {
                        errors.push('Two non-adjacent non-required arguments of the same type are' +
                            ' not separated by required arguments => '
                            + '\n => arg index => ' + matchedIndex + ' => ' + util.inspect(args[matchedIndex])
                            + '\n => arg index => ' + index + ' => ' + util.inspect(item));
                    }
                }
            }
        }
    });
    if (errors.length) {
        throw new Error(errors.map(function (e) { return (e.stack || e); }).join('\n\n'));
    }
    return r;
}
function getUniqueArrayOfStrings(a) {
    return a.filter(function (item, i, ar) {
        return ar.indexOf(item) === i;
    }).length === a.length;
}
function runChecks(arg, rule, retArgs) {
    var errors = [];
    if (Array.isArray(rule.checks)) {
        rule.checks.forEach(function (fn) {
            try {
                fn.apply(null, [arg, rule, retArgs]);
            }
            catch (err) {
                errors.push(err);
            }
        });
    }
    else if (rule.checks) {
        throw new Error(' => Pragmatic usage error => "checks" property should be an array => ' + util.inspect(rule));
    }
    if (errors.length) {
        throw new Error(errors.map(function (e) { return (e.stack || String(e)); }).join('\n\n\n'));
    }
}
function findTypeOfNextRequiredItem(a, rules) {
    for (var i = a; i < rules.length; i++) {
        console.log(rules[i]);
        if (rules[i].required === true) {
            return rules[i].type;
        }
    }
    return null;
}
function parse(argz, r, $opts) {
    var opts = $opts || {};
    var $parseToObject = !!opts.parseToObject;
    var preParsed = !!opts.preParsed;
    var args = Array.prototype.slice.call(argz);
    if (preParsed) {
        return args;
    }
    debug('\n\n', 'original args => \n', args, '\n\n');
    var rules = r.args;
    var parseToObject = $parseToObject === true || !!r.parseToObject;
    var argNames, ret;
    if (parseToObject) {
        var callee = argz.callee;
        assert(typeof callee === 'function', 'To use "pragmatik" with "parseToObject" option set to true,' +
            ' please pass the arguments object to pragmatik.parse(), [this may not work in strict mode].');
        argNames = fnargs(callee);
        assert(getUniqueArrayOfStrings(argNames), ' => "Pragmatik" usage error => You have duplicate argument names, ' +
            'or otherwise you need to name all your arguments so they match your rules, and are same length.');
        ret = {};
    }
    var argsLengthGreaterThanRulesLength = args.length > rules.length;
    var argsLengthGreaterThanOrEqualToRulesLength = args.length >= rules.length;
    if (argsLengthGreaterThanRulesLength && rules.allowExtraneousTrailingVars === false) {
        throw new Error('=> Usage error from "pragmatik" library => arguments length is greater than length of rules array,' +
            ' and "allowExtraneousTrailingVars" is explicitly set to false.');
    }
    var requiredLength = rules.filter(function (item) { return item.required; });
    if (requiredLength > args.length) {
        throw new Error('"Pragmatic" rules dictate that there are more required args than those passed to function.');
    }
    var retArgs = [];
    var a = 0;
    var argsOfA;
    while (retArgs.length < rules.length || args[a]) {
        argsOfA = args[a];
        var argType = typeof argsOfA;
        if (argType === 'object' && Array.isArray(argsOfA)) {
            argType = 'array';
        }
        var rulesTemp = rules[a];
        if (!rulesTemp) {
            if (r.allowExtraneousTrailingVars === false) {
                throw new Error('Extraneous variable passed for index => ' + a + ' => with value ' + args[a] + '\n' +
                    (r.signatureDescription ? ('The function signature is => ' + r.signatureDescription) : ''));
            }
            else {
                retArgs.push(argsOfA);
                a++;
                continue;
            }
        }
        var rulesType = rulesTemp.type;
        if (rulesType === argType) {
            runChecks(args[a], rulesTemp, retArgs);
            if (parseToObject) {
                retArgs.push({
                    name: argNames[a],
                    value: argsOfA
                });
            }
            else {
                retArgs.push(argsOfA);
            }
        }
        else if (a > retArgs.length) {
            if (r.allowExtraneousTrailingVars === false) {
                throw new Error('Extraneous variable passed for index => ' + a + ' => with value ' + args[a]);
            }
            if (parseToObject) {
                retArgs.push({
                    name: argNames[a],
                    value: argsOfA
                });
            }
            else {
                retArgs.push(argsOfA);
            }
        }
        else if (!rulesTemp.required) {
            if (r.allowExtraneousTrailingVars === false && (retArgs.length > (rules.length - 1)) && args[a]) {
                throw new Error('Extraneous variable passed for => "' + argNames[a] + '" => ' + util.inspect(args[a]));
            }
            if (argsLengthGreaterThanOrEqualToRulesLength) {
                if (argsOfA !== undefined) {
                    var errMsg = rulesTemp.errorMessage;
                    var msg = typeof errMsg === 'function' ? errMsg(r) : (errMsg || '');
                    throw new Error(msg + '\nArgument is *not* required at argument index = ' + a +
                        ', but type was wrong \n => expected => "'
                        + rulesType + '"\n => actual => "' + argType + '"');
                }
            }
            else {
                args.splice(a, 0, undefined);
            }
            var fn = rulesTemp.default;
            var deflt = undefined;
            if (fn && typeof fn !== 'function') {
                throw new Error(' => Pragmatik usage error => "default" property should be undefined or a function.');
            }
            else if (fn) {
                deflt = fn();
            }
            if (parseToObject) {
                retArgs.push({
                    name: argNames[a],
                    value: deflt
                });
            }
            else {
                retArgs.push(deflt);
            }
        }
        else {
            var errMsg = rulesTemp.errorMessage;
            var msg = typeof errMsg === 'function' ? errMsg(r) : (errMsg || '');
            throw new Error(msg + '\nArgument is required at argument index = ' + a + ', ' +
                'but type was wrong \n => expected => "'
                + rulesType + '"\n => actual => "' + argType + '"');
        }
        a++;
    }
    if (parseToObject) {
        retArgs.forEach(function (item) {
            ret[item.name] = item.value;
        });
        return ret;
    }
    rules.forEach(function (r, index) {
        if (r.postChecks) {
            r.postChecks.forEach(function (fn) {
                fn.apply(null, [index, retArgs]);
            });
        }
    });
    return retArgs;
}
module.exports = {
    parse: parse,
    signature: signature
};
define("node_modules/rxjs/src/util/isFunction", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isFunction(x) {
        return typeof x === 'function';
    }
    exports.isFunction = isFunction;
});
define("node_modules/rxjs/src/Observer", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.empty = {
        closed: true,
        next: function (value) { },
        error: function (err) { throw err; },
        complete: function () { }
    };
});
define("node_modules/rxjs/src/util/isArray", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isArray = Array.isArray || (function (x) { return x && typeof x.length === 'number'; });
});
define("node_modules/rxjs/src/util/isObject", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isObject(x) {
        return x != null && typeof x === 'object';
    }
    exports.isObject = isObject;
});
define("node_modules/rxjs/src/util/errorObject", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.errorObject = { e: {} };
});
define("node_modules/rxjs/src/util/tryCatch", ["require", "exports", "node_modules/rxjs/src/util/errorObject"], function (require, exports, errorObject_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tryCatchTarget;
    function tryCatcher() {
        try {
            return tryCatchTarget.apply(this, arguments);
        }
        catch (e) {
            errorObject_1.errorObject.e = e;
            return errorObject_1.errorObject;
        }
    }
    function tryCatch(fn) {
        tryCatchTarget = fn;
        return tryCatcher;
    }
    exports.tryCatch = tryCatch;
    ;
});
define("node_modules/rxjs/src/util/UnsubscriptionError", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var UnsubscriptionError = (function (_super) {
        __extends(UnsubscriptionError, _super);
        function UnsubscriptionError(errors) {
            var _this = _super.call(this) || this;
            _this.errors = errors;
            var err = Error.call(_this, errors ?
                errors.length + " errors occurred during unsubscription:\n  " + errors.map(function (err, i) { return i + 1 + ") " + err.toString(); }).join('\n  ') : '');
            _this.name = err.name = 'UnsubscriptionError';
            _this.stack = err.stack;
            _this.message = err.message;
            return _this;
        }
        return UnsubscriptionError;
    }(Error));
    exports.UnsubscriptionError = UnsubscriptionError;
});
define("node_modules/rxjs/src/Subscription", ["require", "exports", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/util/isObject", "node_modules/rxjs/src/util/isFunction", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/util/UnsubscriptionError"], function (require, exports, isArray_1, isObject_1, isFunction_1, tryCatch_1, errorObject_2, UnsubscriptionError_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Subscription = (function () {
        function Subscription(unsubscribe) {
            this.closed = false;
            this._parent = null;
            this._parents = null;
            this._subscriptions = null;
            if (unsubscribe) {
                this._unsubscribe = unsubscribe;
            }
        }
        Subscription.prototype.unsubscribe = function () {
            var hasErrors = false;
            var errors;
            if (this.closed) {
                return;
            }
            var _a = this, _parent = _a._parent, _parents = _a._parents, _unsubscribe = _a._unsubscribe, _subscriptions = _a._subscriptions;
            this.closed = true;
            this._parent = null;
            this._parents = null;
            this._subscriptions = null;
            var index = -1;
            var len = _parents ? _parents.length : 0;
            while (_parent) {
                _parent.remove(this);
                _parent = ++index < len && _parents[index] || null;
            }
            if (isFunction_1.isFunction(_unsubscribe)) {
                var trial = tryCatch_1.tryCatch(_unsubscribe).call(this);
                if (trial === errorObject_2.errorObject) {
                    hasErrors = true;
                    errors = errors || (errorObject_2.errorObject.e instanceof UnsubscriptionError_1.UnsubscriptionError ?
                        flattenUnsubscriptionErrors(errorObject_2.errorObject.e.errors) : [errorObject_2.errorObject.e]);
                }
            }
            if (isArray_1.isArray(_subscriptions)) {
                index = -1;
                len = _subscriptions.length;
                while (++index < len) {
                    var sub = _subscriptions[index];
                    if (isObject_1.isObject(sub)) {
                        var trial = tryCatch_1.tryCatch(sub.unsubscribe).call(sub);
                        if (trial === errorObject_2.errorObject) {
                            hasErrors = true;
                            errors = errors || [];
                            var err = errorObject_2.errorObject.e;
                            if (err instanceof UnsubscriptionError_1.UnsubscriptionError) {
                                errors = errors.concat(flattenUnsubscriptionErrors(err.errors));
                            }
                            else {
                                errors.push(err);
                            }
                        }
                    }
                }
            }
            if (hasErrors) {
                throw new UnsubscriptionError_1.UnsubscriptionError(errors);
            }
        };
        Subscription.prototype.add = function (teardown) {
            if (!teardown || (teardown === Subscription.EMPTY)) {
                return Subscription.EMPTY;
            }
            if (teardown === this) {
                return this;
            }
            var subscription = teardown;
            switch (typeof teardown) {
                case 'function':
                    subscription = new Subscription(teardown);
                case 'object':
                    if (subscription.closed || typeof subscription.unsubscribe !== 'function') {
                        return subscription;
                    }
                    else if (this.closed) {
                        subscription.unsubscribe();
                        return subscription;
                    }
                    else if (typeof subscription._addParent !== 'function') {
                        var tmp = subscription;
                        subscription = new Subscription();
                        subscription._subscriptions = [tmp];
                    }
                    break;
                default:
                    throw new Error('unrecognized teardown ' + teardown + ' added to Subscription.');
            }
            var subscriptions = this._subscriptions || (this._subscriptions = []);
            subscriptions.push(subscription);
            subscription._addParent(this);
            return subscription;
        };
        Subscription.prototype.remove = function (subscription) {
            var subscriptions = this._subscriptions;
            if (subscriptions) {
                var subscriptionIndex = subscriptions.indexOf(subscription);
                if (subscriptionIndex !== -1) {
                    subscriptions.splice(subscriptionIndex, 1);
                }
            }
        };
        Subscription.prototype._addParent = function (parent) {
            var _a = this, _parent = _a._parent, _parents = _a._parents;
            if (!_parent || _parent === parent) {
                this._parent = parent;
            }
            else if (!_parents) {
                this._parents = [parent];
            }
            else if (_parents.indexOf(parent) === -1) {
                _parents.push(parent);
            }
        };
        return Subscription;
    }());
    Subscription.EMPTY = (function (empty) {
        empty.closed = true;
        return empty;
    }(new Subscription()));
    exports.Subscription = Subscription;
    function flattenUnsubscriptionErrors(errors) {
        return errors.reduce(function (errs, err) { return errs.concat((err instanceof UnsubscriptionError_1.UnsubscriptionError) ? err.errors : err); }, []);
    }
});
define("node_modules/rxjs/src/util/root", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.root = (typeof window == 'object' && window.window === window && window
        || typeof self == 'object' && self.self === self && self
        || typeof global == 'object' && global.global === global && global);
    if (!exports.root) {
        throw new Error('RxJS could not find any global context (window, self, global)');
    }
});
define("node_modules/rxjs/src/symbol/rxSubscriber", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Symbol = root_1.root.Symbol;
    exports.rxSubscriber = (typeof Symbol === 'function' && typeof Symbol.for === 'function') ?
        Symbol.for('rxSubscriber') : '@@rxSubscriber';
    exports.$$rxSubscriber = exports.rxSubscriber;
});
define("node_modules/rxjs/src/Subscriber", ["require", "exports", "node_modules/rxjs/src/util/isFunction", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/Observer", "node_modules/rxjs/src/symbol/rxSubscriber"], function (require, exports, isFunction_2, Subscription_1, Observer_1, rxSubscriber_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Subscriber = (function (_super) {
        __extends(Subscriber, _super);
        function Subscriber(destinationOrNext, error, complete) {
            var _this = _super.call(this) || this;
            _this.syncErrorValue = null;
            _this.syncErrorThrown = false;
            _this.syncErrorThrowable = false;
            _this.isStopped = false;
            switch (arguments.length) {
                case 0:
                    _this.destination = Observer_1.empty;
                    break;
                case 1:
                    if (!destinationOrNext) {
                        _this.destination = Observer_1.empty;
                        break;
                    }
                    if (typeof destinationOrNext === 'object') {
                        if (destinationOrNext instanceof Subscriber) {
                            _this.destination = destinationOrNext;
                            _this.destination.add(_this);
                        }
                        else {
                            _this.syncErrorThrowable = true;
                            _this.destination = new SafeSubscriber(_this, destinationOrNext);
                        }
                        break;
                    }
                default:
                    _this.syncErrorThrowable = true;
                    _this.destination = new SafeSubscriber(_this, destinationOrNext, error, complete);
                    break;
            }
            return _this;
        }
        Subscriber.prototype[rxSubscriber_1.rxSubscriber] = function () { return this; };
        Subscriber.create = function (next, error, complete) {
            var subscriber = new Subscriber(next, error, complete);
            subscriber.syncErrorThrowable = false;
            return subscriber;
        };
        Subscriber.prototype.next = function (value) {
            if (!this.isStopped) {
                this._next(value);
            }
        };
        Subscriber.prototype.error = function (err) {
            if (!this.isStopped) {
                this.isStopped = true;
                this._error(err);
            }
        };
        Subscriber.prototype.complete = function () {
            if (!this.isStopped) {
                this.isStopped = true;
                this._complete();
            }
        };
        Subscriber.prototype.unsubscribe = function () {
            if (this.closed) {
                return;
            }
            this.isStopped = true;
            _super.prototype.unsubscribe.call(this);
        };
        Subscriber.prototype._next = function (value) {
            this.destination.next(value);
        };
        Subscriber.prototype._error = function (err) {
            this.destination.error(err);
            this.unsubscribe();
        };
        Subscriber.prototype._complete = function () {
            this.destination.complete();
            this.unsubscribe();
        };
        Subscriber.prototype._unsubscribeAndRecycle = function () {
            var _a = this, _parent = _a._parent, _parents = _a._parents;
            this._parent = null;
            this._parents = null;
            this.unsubscribe();
            this.closed = false;
            this.isStopped = false;
            this._parent = _parent;
            this._parents = _parents;
            return this;
        };
        return Subscriber;
    }(Subscription_1.Subscription));
    exports.Subscriber = Subscriber;
    var SafeSubscriber = (function (_super) {
        __extends(SafeSubscriber, _super);
        function SafeSubscriber(_parentSubscriber, observerOrNext, error, complete) {
            var _this = _super.call(this) || this;
            _this._parentSubscriber = _parentSubscriber;
            var next;
            var context = _this;
            if (isFunction_2.isFunction(observerOrNext)) {
                next = observerOrNext;
            }
            else if (observerOrNext) {
                next = observerOrNext.next;
                error = observerOrNext.error;
                complete = observerOrNext.complete;
                if (observerOrNext !== Observer_1.empty) {
                    context = Object.create(observerOrNext);
                    if (isFunction_2.isFunction(context.unsubscribe)) {
                        _this.add(context.unsubscribe.bind(context));
                    }
                    context.unsubscribe = _this.unsubscribe.bind(_this);
                }
            }
            _this._context = context;
            _this._next = next;
            _this._error = error;
            _this._complete = complete;
            return _this;
        }
        SafeSubscriber.prototype.next = function (value) {
            if (!this.isStopped && this._next) {
                var _parentSubscriber = this._parentSubscriber;
                if (!_parentSubscriber.syncErrorThrowable) {
                    this.__tryOrUnsub(this._next, value);
                }
                else if (this.__tryOrSetError(_parentSubscriber, this._next, value)) {
                    this.unsubscribe();
                }
            }
        };
        SafeSubscriber.prototype.error = function (err) {
            if (!this.isStopped) {
                var _parentSubscriber = this._parentSubscriber;
                if (this._error) {
                    if (!_parentSubscriber.syncErrorThrowable) {
                        this.__tryOrUnsub(this._error, err);
                        this.unsubscribe();
                    }
                    else {
                        this.__tryOrSetError(_parentSubscriber, this._error, err);
                        this.unsubscribe();
                    }
                }
                else if (!_parentSubscriber.syncErrorThrowable) {
                    this.unsubscribe();
                    throw err;
                }
                else {
                    _parentSubscriber.syncErrorValue = err;
                    _parentSubscriber.syncErrorThrown = true;
                    this.unsubscribe();
                }
            }
        };
        SafeSubscriber.prototype.complete = function () {
            if (!this.isStopped) {
                var _parentSubscriber = this._parentSubscriber;
                if (this._complete) {
                    if (!_parentSubscriber.syncErrorThrowable) {
                        this.__tryOrUnsub(this._complete);
                        this.unsubscribe();
                    }
                    else {
                        this.__tryOrSetError(_parentSubscriber, this._complete);
                        this.unsubscribe();
                    }
                }
                else {
                    this.unsubscribe();
                }
            }
        };
        SafeSubscriber.prototype.__tryOrUnsub = function (fn, value) {
            try {
                fn.call(this._context, value);
            }
            catch (err) {
                this.unsubscribe();
                throw err;
            }
        };
        SafeSubscriber.prototype.__tryOrSetError = function (parent, fn, value) {
            try {
                fn.call(this._context, value);
            }
            catch (err) {
                parent.syncErrorValue = err;
                parent.syncErrorThrown = true;
                return true;
            }
            return false;
        };
        SafeSubscriber.prototype._unsubscribe = function () {
            var _parentSubscriber = this._parentSubscriber;
            this._context = null;
            this._parentSubscriber = null;
            _parentSubscriber.unsubscribe();
        };
        return SafeSubscriber;
    }(Subscriber));
});
define("node_modules/rxjs/src/Operator", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("node_modules/rxjs/src/util/toSubscriber", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/symbol/rxSubscriber", "node_modules/rxjs/src/Observer"], function (require, exports, Subscriber_1, rxSubscriber_2, Observer_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function toSubscriber(nextOrObserver, error, complete) {
        if (nextOrObserver) {
            if (nextOrObserver instanceof Subscriber_1.Subscriber) {
                return nextOrObserver;
            }
            if (nextOrObserver[rxSubscriber_2.rxSubscriber]) {
                return nextOrObserver[rxSubscriber_2.rxSubscriber]();
            }
        }
        if (!nextOrObserver && !error && !complete) {
            return new Subscriber_1.Subscriber(Observer_2.empty);
        }
        return new Subscriber_1.Subscriber(nextOrObserver, error, complete);
    }
    exports.toSubscriber = toSubscriber;
});
define("node_modules/rxjs/src/util/isArrayLike", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isArrayLike = (function (x) { return x && typeof x.length === 'number'; });
});
define("node_modules/rxjs/src/util/isPromise", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isPromise(value) {
        return value && typeof value.subscribe !== 'function' && typeof value.then === 'function';
    }
    exports.isPromise = isPromise;
});
define("node_modules/rxjs/src/symbol/iterator", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function symbolIteratorPonyfill(root) {
        var Symbol = root.Symbol;
        if (typeof Symbol === 'function') {
            if (!Symbol.iterator) {
                Symbol.iterator = Symbol('iterator polyfill');
            }
            return Symbol.iterator;
        }
        else {
            var Set_1 = root.Set;
            if (Set_1 && typeof new Set_1()['@@iterator'] === 'function') {
                return '@@iterator';
            }
            var Map_1 = root.Map;
            if (Map_1) {
                var keys = Object.getOwnPropertyNames(Map_1.prototype);
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (key !== 'entries' && key !== 'size' && Map_1.prototype[key] === Map_1.prototype['entries']) {
                        return key;
                    }
                }
            }
            return '@@iterator';
        }
    }
    exports.symbolIteratorPonyfill = symbolIteratorPonyfill;
    exports.iterator = symbolIteratorPonyfill(root_2.root);
    exports.$$iterator = exports.iterator;
});
define("node_modules/rxjs/src/OuterSubscriber", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var OuterSubscriber = (function (_super) {
        __extends(OuterSubscriber, _super);
        function OuterSubscriber() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        OuterSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.destination.next(innerValue);
        };
        OuterSubscriber.prototype.notifyError = function (error, innerSub) {
            this.destination.error(error);
        };
        OuterSubscriber.prototype.notifyComplete = function (innerSub) {
            this.destination.complete();
        };
        return OuterSubscriber;
    }(Subscriber_2.Subscriber));
    exports.OuterSubscriber = OuterSubscriber;
});
define("node_modules/rxjs/src/InnerSubscriber", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var InnerSubscriber = (function (_super) {
        __extends(InnerSubscriber, _super);
        function InnerSubscriber(parent, outerValue, outerIndex) {
            var _this = _super.call(this) || this;
            _this.parent = parent;
            _this.outerValue = outerValue;
            _this.outerIndex = outerIndex;
            _this.index = 0;
            return _this;
        }
        InnerSubscriber.prototype._next = function (value) {
            this.parent.notifyNext(this.outerValue, value, this.outerIndex, this.index++, this);
        };
        InnerSubscriber.prototype._error = function (error) {
            this.parent.notifyError(error, this);
            this.unsubscribe();
        };
        InnerSubscriber.prototype._complete = function () {
            this.parent.notifyComplete(this);
            this.unsubscribe();
        };
        return InnerSubscriber;
    }(Subscriber_3.Subscriber));
    exports.InnerSubscriber = InnerSubscriber;
});
define("node_modules/rxjs/src/symbol/observable", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function getSymbolObservable(context) {
        var $$observable;
        var Symbol = context.Symbol;
        if (typeof Symbol === 'function') {
            if (Symbol.observable) {
                $$observable = Symbol.observable;
            }
            else {
                $$observable = Symbol('observable');
                Symbol.observable = $$observable;
            }
        }
        else {
            $$observable = '@@observable';
        }
        return $$observable;
    }
    exports.getSymbolObservable = getSymbolObservable;
    exports.observable = getSymbolObservable(root_3.root);
    exports.$$observable = exports.observable;
});
define("node_modules/rxjs/src/util/subscribeToResult", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/util/isArrayLike", "node_modules/rxjs/src/util/isPromise", "node_modules/rxjs/src/util/isObject", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/symbol/iterator", "node_modules/rxjs/src/InnerSubscriber", "node_modules/rxjs/src/symbol/observable"], function (require, exports, root_4, isArrayLike_1, isPromise_1, isObject_2, Observable_1, iterator_1, InnerSubscriber_1, observable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function subscribeToResult(outerSubscriber, result, outerValue, outerIndex) {
        var destination = new InnerSubscriber_1.InnerSubscriber(outerSubscriber, outerValue, outerIndex);
        if (destination.closed) {
            return null;
        }
        if (result instanceof Observable_1.Observable) {
            if (result._isScalar) {
                destination.next(result.value);
                destination.complete();
                return null;
            }
            else {
                return result.subscribe(destination);
            }
        }
        else if (isArrayLike_1.isArrayLike(result)) {
            for (var i = 0, len = result.length; i < len && !destination.closed; i++) {
                destination.next(result[i]);
            }
            if (!destination.closed) {
                destination.complete();
            }
        }
        else if (isPromise_1.isPromise(result)) {
            result.then(function (value) {
                if (!destination.closed) {
                    destination.next(value);
                    destination.complete();
                }
            }, function (err) { return destination.error(err); })
                .then(null, function (err) {
                root_4.root.setTimeout(function () { throw err; });
            });
            return destination;
        }
        else if (result && typeof result[iterator_1.iterator] === 'function') {
            var iterator = result[iterator_1.iterator]();
            do {
                var item = iterator.next();
                if (item.done) {
                    destination.complete();
                    break;
                }
                destination.next(item.value);
                if (destination.closed) {
                    break;
                }
            } while (true);
        }
        else if (result && typeof result[observable_1.observable] === 'function') {
            var obs = result[observable_1.observable]();
            if (typeof obs.subscribe !== 'function') {
                destination.error(new TypeError('Provided object does not correctly implement Symbol.observable'));
            }
            else {
                return obs.subscribe(new InnerSubscriber_1.InnerSubscriber(outerSubscriber, outerValue, outerIndex));
            }
        }
        else {
            var value = isObject_2.isObject(result) ? 'an invalid object' : "'" + result + "'";
            var msg = "You provided " + value + " where a stream was expected."
                + ' You can provide an Observable, Promise, Array, or Iterable.';
            destination.error(new TypeError(msg));
        }
        return null;
    }
    exports.subscribeToResult = subscribeToResult;
});
define("node_modules/rxjs/src/observable/IfObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, Observable_2, subscribeToResult_1, OuterSubscriber_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var IfObservable = (function (_super) {
        __extends(IfObservable, _super);
        function IfObservable(condition, thenSource, elseSource) {
            var _this = _super.call(this) || this;
            _this.condition = condition;
            _this.thenSource = thenSource;
            _this.elseSource = elseSource;
            return _this;
        }
        IfObservable.create = function (condition, thenSource, elseSource) {
            return new IfObservable(condition, thenSource, elseSource);
        };
        IfObservable.prototype._subscribe = function (subscriber) {
            var _a = this, condition = _a.condition, thenSource = _a.thenSource, elseSource = _a.elseSource;
            return new IfSubscriber(subscriber, condition, thenSource, elseSource);
        };
        return IfObservable;
    }(Observable_2.Observable));
    exports.IfObservable = IfObservable;
    var IfSubscriber = (function (_super) {
        __extends(IfSubscriber, _super);
        function IfSubscriber(destination, condition, thenSource, elseSource) {
            var _this = _super.call(this, destination) || this;
            _this.condition = condition;
            _this.thenSource = thenSource;
            _this.elseSource = elseSource;
            _this.tryIf();
            return _this;
        }
        IfSubscriber.prototype.tryIf = function () {
            var _a = this, condition = _a.condition, thenSource = _a.thenSource, elseSource = _a.elseSource;
            var result;
            try {
                result = condition();
                var source = result ? thenSource : elseSource;
                if (source) {
                    this.add(subscribeToResult_1.subscribeToResult(this, source));
                }
                else {
                    this._complete();
                }
            }
            catch (err) {
                this._error(err);
            }
        };
        return IfSubscriber;
    }(OuterSubscriber_1.OuterSubscriber));
});
define("node_modules/rxjs/src/scheduler/Action", ["require", "exports", "node_modules/rxjs/src/Subscription"], function (require, exports, Subscription_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Action = (function (_super) {
        __extends(Action, _super);
        function Action(scheduler, work) {
            return _super.call(this) || this;
        }
        Action.prototype.schedule = function (state, delay) {
            if (delay === void 0) { delay = 0; }
            return this;
        };
        return Action;
    }(Subscription_2.Subscription));
    exports.Action = Action;
});
define("node_modules/rxjs/src/Scheduler", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Scheduler = (function () {
        function Scheduler(SchedulerAction, now) {
            if (now === void 0) { now = Scheduler.now; }
            this.SchedulerAction = SchedulerAction;
            this.now = now;
        }
        Scheduler.prototype.schedule = function (work, delay, state) {
            if (delay === void 0) { delay = 0; }
            return new this.SchedulerAction(this, work).schedule(state, delay);
        };
        return Scheduler;
    }());
    Scheduler.now = Date.now ? Date.now : function () { return +new Date(); };
    exports.Scheduler = Scheduler;
});
define("node_modules/rxjs/src/observable/ErrorObservable", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ErrorObservable = (function (_super) {
        __extends(ErrorObservable, _super);
        function ErrorObservable(error, scheduler) {
            var _this = _super.call(this) || this;
            _this.error = error;
            _this.scheduler = scheduler;
            return _this;
        }
        ErrorObservable.create = function (error, scheduler) {
            return new ErrorObservable(error, scheduler);
        };
        ErrorObservable.dispatch = function (arg) {
            var error = arg.error, subscriber = arg.subscriber;
            subscriber.error(error);
        };
        ErrorObservable.prototype._subscribe = function (subscriber) {
            var error = this.error;
            var scheduler = this.scheduler;
            if (scheduler) {
                return scheduler.schedule(ErrorObservable.dispatch, 0, {
                    error: error, subscriber: subscriber
                });
            }
            else {
                subscriber.error(error);
            }
        };
        return ErrorObservable;
    }(Observable_3.Observable));
    exports.ErrorObservable = ErrorObservable;
});
define("node_modules/rxjs/src/Observable", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/util/toSubscriber", "node_modules/rxjs/src/symbol/observable"], function (require, exports, root_5, toSubscriber_1, observable_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Observable = (function () {
        function Observable(subscribe) {
            this._isScalar = false;
            if (subscribe) {
                this._subscribe = subscribe;
            }
        }
        Observable.prototype.lift = function (operator) {
            var observable = new Observable();
            observable.source = this;
            observable.operator = operator;
            return observable;
        };
        Observable.prototype.subscribe = function (observerOrNext, error, complete) {
            var operator = this.operator;
            var sink = toSubscriber_1.toSubscriber(observerOrNext, error, complete);
            if (operator) {
                operator.call(sink, this.source);
            }
            else {
                sink.add(this._trySubscribe(sink));
            }
            if (sink.syncErrorThrowable) {
                sink.syncErrorThrowable = false;
                if (sink.syncErrorThrown) {
                    throw sink.syncErrorValue;
                }
            }
            return sink;
        };
        Observable.prototype._trySubscribe = function (sink) {
            try {
                return this._subscribe(sink);
            }
            catch (err) {
                sink.syncErrorThrown = true;
                sink.syncErrorValue = err;
                sink.error(err);
            }
        };
        Observable.prototype.forEach = function (next, PromiseCtor) {
            var _this = this;
            if (!PromiseCtor) {
                if (root_5.root.Rx && root_5.root.Rx.config && root_5.root.Rx.config.Promise) {
                    PromiseCtor = root_5.root.Rx.config.Promise;
                }
                else if (root_5.root.Promise) {
                    PromiseCtor = root_5.root.Promise;
                }
            }
            if (!PromiseCtor) {
                throw new Error('no Promise impl found');
            }
            return new PromiseCtor(function (resolve, reject) {
                var subscription;
                subscription = _this.subscribe(function (value) {
                    if (subscription) {
                        try {
                            next(value);
                        }
                        catch (err) {
                            reject(err);
                            subscription.unsubscribe();
                        }
                    }
                    else {
                        next(value);
                    }
                }, reject, resolve);
            });
        };
        Observable.prototype._subscribe = function (subscriber) {
            return this.source.subscribe(subscriber);
        };
        Observable.prototype[observable_2.observable] = function () {
            return this;
        };
        return Observable;
    }());
    Observable.create = function (subscribe) {
        return new Observable(subscribe);
    };
    exports.Observable = Observable;
});
define("node_modules/rxjs/src/util/ObjectUnsubscribedError", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ObjectUnsubscribedError = (function (_super) {
        __extends(ObjectUnsubscribedError, _super);
        function ObjectUnsubscribedError() {
            var _this = this;
            var err = _this = _super.call(this, 'object unsubscribed') || this;
            _this.name = err.name = 'ObjectUnsubscribedError';
            _this.stack = err.stack;
            _this.message = err.message;
            return _this;
        }
        return ObjectUnsubscribedError;
    }(Error));
    exports.ObjectUnsubscribedError = ObjectUnsubscribedError;
});
define("node_modules/rxjs/src/SubjectSubscription", ["require", "exports", "node_modules/rxjs/src/Subscription"], function (require, exports, Subscription_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SubjectSubscription = (function (_super) {
        __extends(SubjectSubscription, _super);
        function SubjectSubscription(subject, subscriber) {
            var _this = _super.call(this) || this;
            _this.subject = subject;
            _this.subscriber = subscriber;
            _this.closed = false;
            return _this;
        }
        SubjectSubscription.prototype.unsubscribe = function () {
            if (this.closed) {
                return;
            }
            this.closed = true;
            var subject = this.subject;
            var observers = subject.observers;
            this.subject = null;
            if (!observers || observers.length === 0 || subject.isStopped || subject.closed) {
                return;
            }
            var subscriberIndex = observers.indexOf(this.subscriber);
            if (subscriberIndex !== -1) {
                observers.splice(subscriberIndex, 1);
            }
        };
        return SubjectSubscription;
    }(Subscription_3.Subscription));
    exports.SubjectSubscription = SubjectSubscription;
});
define("node_modules/rxjs/src/Subject", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/util/ObjectUnsubscribedError", "node_modules/rxjs/src/SubjectSubscription", "node_modules/rxjs/src/symbol/rxSubscriber"], function (require, exports, Observable_4, Subscriber_4, Subscription_4, ObjectUnsubscribedError_1, SubjectSubscription_1, rxSubscriber_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SubjectSubscriber = (function (_super) {
        __extends(SubjectSubscriber, _super);
        function SubjectSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            return _this;
        }
        return SubjectSubscriber;
    }(Subscriber_4.Subscriber));
    exports.SubjectSubscriber = SubjectSubscriber;
    var Subject = (function (_super) {
        __extends(Subject, _super);
        function Subject() {
            var _this = _super.call(this) || this;
            _this.observers = [];
            _this.closed = false;
            _this.isStopped = false;
            _this.hasError = false;
            _this.thrownError = null;
            return _this;
        }
        Subject.prototype[rxSubscriber_3.rxSubscriber] = function () {
            return new SubjectSubscriber(this);
        };
        Subject.prototype.lift = function (operator) {
            var subject = new AnonymousSubject(this, this);
            subject.operator = operator;
            return subject;
        };
        Subject.prototype.next = function (value) {
            if (this.closed) {
                throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();
            }
            if (!this.isStopped) {
                var observers = this.observers;
                var len = observers.length;
                var copy = observers.slice();
                for (var i = 0; i < len; i++) {
                    copy[i].next(value);
                }
            }
        };
        Subject.prototype.error = function (err) {
            if (this.closed) {
                throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();
            }
            this.hasError = true;
            this.thrownError = err;
            this.isStopped = true;
            var observers = this.observers;
            var len = observers.length;
            var copy = observers.slice();
            for (var i = 0; i < len; i++) {
                copy[i].error(err);
            }
            this.observers.length = 0;
        };
        Subject.prototype.complete = function () {
            if (this.closed) {
                throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();
            }
            this.isStopped = true;
            var observers = this.observers;
            var len = observers.length;
            var copy = observers.slice();
            for (var i = 0; i < len; i++) {
                copy[i].complete();
            }
            this.observers.length = 0;
        };
        Subject.prototype.unsubscribe = function () {
            this.isStopped = true;
            this.closed = true;
            this.observers = null;
        };
        Subject.prototype._trySubscribe = function (subscriber) {
            if (this.closed) {
                throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();
            }
            else {
                return _super.prototype._trySubscribe.call(this, subscriber);
            }
        };
        Subject.prototype._subscribe = function (subscriber) {
            if (this.closed) {
                throw new ObjectUnsubscribedError_1.ObjectUnsubscribedError();
            }
            else if (this.hasError) {
                subscriber.error(this.thrownError);
                return Subscription_4.Subscription.EMPTY;
            }
            else if (this.isStopped) {
                subscriber.complete();
                return Subscription_4.Subscription.EMPTY;
            }
            else {
                this.observers.push(subscriber);
                return new SubjectSubscription_1.SubjectSubscription(this, subscriber);
            }
        };
        Subject.prototype.asObservable = function () {
            var observable = new Observable_4.Observable();
            observable.source = this;
            return observable;
        };
        return Subject;
    }(Observable_4.Observable));
    Subject.create = function (destination, source) {
        return new AnonymousSubject(destination, source);
    };
    exports.Subject = Subject;
    var AnonymousSubject = (function (_super) {
        __extends(AnonymousSubject, _super);
        function AnonymousSubject(destination, source) {
            var _this = _super.call(this) || this;
            _this.destination = destination;
            _this.source = source;
            return _this;
        }
        AnonymousSubject.prototype.next = function (value) {
            var destination = this.destination;
            if (destination && destination.next) {
                destination.next(value);
            }
        };
        AnonymousSubject.prototype.error = function (err) {
            var destination = this.destination;
            if (destination && destination.error) {
                this.destination.error(err);
            }
        };
        AnonymousSubject.prototype.complete = function () {
            var destination = this.destination;
            if (destination && destination.complete) {
                this.destination.complete();
            }
        };
        AnonymousSubject.prototype._subscribe = function (subscriber) {
            var source = this.source;
            if (source) {
                return this.source.subscribe(subscriber);
            }
            else {
                return Subscription_4.Subscription.EMPTY;
            }
        };
        return AnonymousSubject;
    }(Subject));
    exports.AnonymousSubject = AnonymousSubject;
});
define("node_modules/rxjs/src/AsyncSubject", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Subscription"], function (require, exports, Subject_1, Subscription_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AsyncSubject = (function (_super) {
        __extends(AsyncSubject, _super);
        function AsyncSubject() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.value = null;
            _this.hasNext = false;
            _this.hasCompleted = false;
            return _this;
        }
        AsyncSubject.prototype._subscribe = function (subscriber) {
            if (this.hasError) {
                subscriber.error(this.thrownError);
                return Subscription_5.Subscription.EMPTY;
            }
            else if (this.hasCompleted && this.hasNext) {
                subscriber.next(this.value);
                subscriber.complete();
                return Subscription_5.Subscription.EMPTY;
            }
            return _super.prototype._subscribe.call(this, subscriber);
        };
        AsyncSubject.prototype.next = function (value) {
            if (!this.hasCompleted) {
                this.value = value;
                this.hasNext = true;
            }
        };
        AsyncSubject.prototype.error = function (error) {
            if (!this.hasCompleted) {
                _super.prototype.error.call(this, error);
            }
        };
        AsyncSubject.prototype.complete = function () {
            this.hasCompleted = true;
            if (this.hasNext) {
                _super.prototype.next.call(this, this.value);
            }
            _super.prototype.complete.call(this);
        };
        return AsyncSubject;
    }(Subject_1.Subject));
    exports.AsyncSubject = AsyncSubject;
});
define("node_modules/rxjs/src/BehaviorSubject", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/util/ObjectUnsubscribedError"], function (require, exports, Subject_2, ObjectUnsubscribedError_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var BehaviorSubject = (function (_super) {
        __extends(BehaviorSubject, _super);
        function BehaviorSubject(_value) {
            var _this = _super.call(this) || this;
            _this._value = _value;
            return _this;
        }
        Object.defineProperty(BehaviorSubject.prototype, "value", {
            get: function () {
                return this.getValue();
            },
            enumerable: true,
            configurable: true
        });
        BehaviorSubject.prototype._subscribe = function (subscriber) {
            var subscription = _super.prototype._subscribe.call(this, subscriber);
            if (subscription && !subscription.closed) {
                subscriber.next(this._value);
            }
            return subscription;
        };
        BehaviorSubject.prototype.getValue = function () {
            if (this.hasError) {
                throw this.thrownError;
            }
            else if (this.closed) {
                throw new ObjectUnsubscribedError_2.ObjectUnsubscribedError();
            }
            else {
                return this._value;
            }
        };
        BehaviorSubject.prototype.next = function (value) {
            _super.prototype.next.call(this, this._value = value);
        };
        return BehaviorSubject;
    }(Subject_2.Subject));
    exports.BehaviorSubject = BehaviorSubject;
});
define("node_modules/rxjs/src/operator/map", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function map(project, thisArg) {
        if (typeof project !== 'function') {
            throw new TypeError('argument is not a function. Are you looking for `mapTo()`?');
        }
        return this.lift(new MapOperator(project, thisArg));
    }
    exports.map = map;
    var MapOperator = (function () {
        function MapOperator(project, thisArg) {
            this.project = project;
            this.thisArg = thisArg;
        }
        MapOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new MapSubscriber(subscriber, this.project, this.thisArg));
        };
        return MapOperator;
    }());
    exports.MapOperator = MapOperator;
    var MapSubscriber = (function (_super) {
        __extends(MapSubscriber, _super);
        function MapSubscriber(destination, project, thisArg) {
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.count = 0;
            _this.thisArg = thisArg || _this;
            return _this;
        }
        MapSubscriber.prototype._next = function (value) {
            var result;
            try {
                result = this.project.call(this.thisArg, value, this.count++);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        return MapSubscriber;
    }(Subscriber_5.Subscriber));
});
define("node_modules/rxjs/src/observable/dom/AjaxObservable", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/operator/map"], function (require, exports, root_6, tryCatch_2, errorObject_3, Observable_5, Subscriber_6, map_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function getCORSRequest() {
        if (root_6.root.XMLHttpRequest) {
            return new root_6.root.XMLHttpRequest();
        }
        else if (!!root_6.root.XDomainRequest) {
            return new root_6.root.XDomainRequest();
        }
        else {
            throw new Error('CORS is not supported by your browser');
        }
    }
    function getXMLHttpRequest() {
        if (root_6.root.XMLHttpRequest) {
            return new root_6.root.XMLHttpRequest();
        }
        else {
            var progId = void 0;
            try {
                var progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'];
                for (var i = 0; i < 3; i++) {
                    try {
                        progId = progIds[i];
                        if (new root_6.root.ActiveXObject(progId)) {
                            break;
                        }
                    }
                    catch (e) {
                    }
                }
                return new root_6.root.ActiveXObject(progId);
            }
            catch (e) {
                throw new Error('XMLHttpRequest is not supported by your browser');
            }
        }
    }
    function ajaxGet(url, headers) {
        if (headers === void 0) { headers = null; }
        return new AjaxObservable({ method: 'GET', url: url, headers: headers });
    }
    exports.ajaxGet = ajaxGet;
    ;
    function ajaxPost(url, body, headers) {
        return new AjaxObservable({ method: 'POST', url: url, body: body, headers: headers });
    }
    exports.ajaxPost = ajaxPost;
    ;
    function ajaxDelete(url, headers) {
        return new AjaxObservable({ method: 'DELETE', url: url, headers: headers });
    }
    exports.ajaxDelete = ajaxDelete;
    ;
    function ajaxPut(url, body, headers) {
        return new AjaxObservable({ method: 'PUT', url: url, body: body, headers: headers });
    }
    exports.ajaxPut = ajaxPut;
    ;
    function ajaxPatch(url, body, headers) {
        return new AjaxObservable({ method: 'PATCH', url: url, body: body, headers: headers });
    }
    exports.ajaxPatch = ajaxPatch;
    ;
    function ajaxGetJSON(url, headers) {
        return new AjaxObservable({ method: 'GET', url: url, responseType: 'json', headers: headers })
            .lift(new map_1.MapOperator(function (x, index) { return x.response; }, null));
    }
    exports.ajaxGetJSON = ajaxGetJSON;
    ;
    var AjaxObservable = (function (_super) {
        __extends(AjaxObservable, _super);
        function AjaxObservable(urlOrRequest) {
            var _this = _super.call(this) || this;
            var request = {
                async: true,
                createXHR: function () {
                    return this.crossDomain ? getCORSRequest.call(this) : getXMLHttpRequest();
                },
                crossDomain: false,
                withCredentials: false,
                headers: {},
                method: 'GET',
                responseType: 'json',
                timeout: 0
            };
            if (typeof urlOrRequest === 'string') {
                request.url = urlOrRequest;
            }
            else {
                for (var prop in urlOrRequest) {
                    if (urlOrRequest.hasOwnProperty(prop)) {
                        request[prop] = urlOrRequest[prop];
                    }
                }
            }
            _this.request = request;
            return _this;
        }
        AjaxObservable.prototype._subscribe = function (subscriber) {
            return new AjaxSubscriber(subscriber, this.request);
        };
        return AjaxObservable;
    }(Observable_5.Observable));
    AjaxObservable.create = (function () {
        var create = function (urlOrRequest) {
            return new AjaxObservable(urlOrRequest);
        };
        create.get = ajaxGet;
        create.post = ajaxPost;
        create.delete = ajaxDelete;
        create.put = ajaxPut;
        create.patch = ajaxPatch;
        create.getJSON = ajaxGetJSON;
        return create;
    })();
    exports.AjaxObservable = AjaxObservable;
    var AjaxSubscriber = (function (_super) {
        __extends(AjaxSubscriber, _super);
        function AjaxSubscriber(destination, request) {
            var _this = _super.call(this, destination) || this;
            _this.request = request;
            _this.done = false;
            var headers = request.headers = request.headers || {};
            if (!request.crossDomain && !headers['X-Requested-With']) {
                headers['X-Requested-With'] = 'XMLHttpRequest';
            }
            if (!('Content-Type' in headers) && !(root_6.root.FormData && request.body instanceof root_6.root.FormData) && typeof request.body !== 'undefined') {
                headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            }
            request.body = _this.serializeBody(request.body, request.headers['Content-Type']);
            _this.send();
            return _this;
        }
        AjaxSubscriber.prototype.next = function (e) {
            this.done = true;
            var _a = this, xhr = _a.xhr, request = _a.request, destination = _a.destination;
            var response = new AjaxResponse(e, xhr, request);
            destination.next(response);
        };
        AjaxSubscriber.prototype.send = function () {
            var _a = this, request = _a.request, _b = _a.request, user = _b.user, method = _b.method, url = _b.url, async = _b.async, password = _b.password, headers = _b.headers, body = _b.body;
            var createXHR = request.createXHR;
            var xhr = tryCatch_2.tryCatch(createXHR).call(request);
            if (xhr === errorObject_3.errorObject) {
                this.error(errorObject_3.errorObject.e);
            }
            else {
                this.xhr = xhr;
                this.setupEvents(xhr, request);
                var result = void 0;
                if (user) {
                    result = tryCatch_2.tryCatch(xhr.open).call(xhr, method, url, async, user, password);
                }
                else {
                    result = tryCatch_2.tryCatch(xhr.open).call(xhr, method, url, async);
                }
                if (result === errorObject_3.errorObject) {
                    this.error(errorObject_3.errorObject.e);
                    return null;
                }
                xhr.timeout = request.timeout;
                xhr.responseType = request.responseType;
                if ('withCredentials' in xhr) {
                    xhr.withCredentials = !!request.withCredentials;
                }
                this.setHeaders(xhr, headers);
                result = body ? tryCatch_2.tryCatch(xhr.send).call(xhr, body) : tryCatch_2.tryCatch(xhr.send).call(xhr);
                if (result === errorObject_3.errorObject) {
                    this.error(errorObject_3.errorObject.e);
                    return null;
                }
            }
            return xhr;
        };
        AjaxSubscriber.prototype.serializeBody = function (body, contentType) {
            if (!body || typeof body === 'string') {
                return body;
            }
            else if (root_6.root.FormData && body instanceof root_6.root.FormData) {
                return body;
            }
            if (contentType) {
                var splitIndex = contentType.indexOf(';');
                if (splitIndex !== -1) {
                    contentType = contentType.substring(0, splitIndex);
                }
            }
            switch (contentType) {
                case 'application/x-www-form-urlencoded':
                    return Object.keys(body).map(function (key) { return encodeURI(key) + "=" + encodeURI(body[key]); }).join('&');
                case 'application/json':
                    return JSON.stringify(body);
                default:
                    return body;
            }
        };
        AjaxSubscriber.prototype.setHeaders = function (xhr, headers) {
            for (var key in headers) {
                if (headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, headers[key]);
                }
            }
        };
        AjaxSubscriber.prototype.setupEvents = function (xhr, request) {
            var progressSubscriber = request.progressSubscriber;
            function xhrTimeout(e) {
                var _a = xhrTimeout, subscriber = _a.subscriber, progressSubscriber = _a.progressSubscriber, request = _a.request;
                if (progressSubscriber) {
                    progressSubscriber.error(e);
                }
                subscriber.error(new AjaxTimeoutError(this, request));
            }
            ;
            xhr.ontimeout = xhrTimeout;
            xhrTimeout.request = request;
            xhrTimeout.subscriber = this;
            xhrTimeout.progressSubscriber = progressSubscriber;
            if (xhr.upload && 'withCredentials' in xhr) {
                if (progressSubscriber) {
                    var xhrProgress_1;
                    xhrProgress_1 = function (e) {
                        var progressSubscriber = xhrProgress_1.progressSubscriber;
                        progressSubscriber.next(e);
                    };
                    if (root_6.root.XDomainRequest) {
                        xhr.onprogress = xhrProgress_1;
                    }
                    else {
                        xhr.upload.onprogress = xhrProgress_1;
                    }
                    xhrProgress_1.progressSubscriber = progressSubscriber;
                }
                var xhrError_1;
                xhrError_1 = function (e) {
                    var _a = xhrError_1, progressSubscriber = _a.progressSubscriber, subscriber = _a.subscriber, request = _a.request;
                    if (progressSubscriber) {
                        progressSubscriber.error(e);
                    }
                    subscriber.error(new AjaxError('ajax error', this, request));
                };
                xhr.onerror = xhrError_1;
                xhrError_1.request = request;
                xhrError_1.subscriber = this;
                xhrError_1.progressSubscriber = progressSubscriber;
            }
            function xhrReadyStateChange(e) {
                var _a = xhrReadyStateChange, subscriber = _a.subscriber, progressSubscriber = _a.progressSubscriber, request = _a.request;
                if (this.readyState === 4) {
                    var status_1 = this.status === 1223 ? 204 : this.status;
                    var response = (this.responseType === 'text' ? (this.response || this.responseText) : this.response);
                    if (status_1 === 0) {
                        status_1 = response ? 200 : 0;
                    }
                    if (200 <= status_1 && status_1 < 300) {
                        if (progressSubscriber) {
                            progressSubscriber.complete();
                        }
                        subscriber.next(e);
                        subscriber.complete();
                    }
                    else {
                        if (progressSubscriber) {
                            progressSubscriber.error(e);
                        }
                        subscriber.error(new AjaxError('ajax error ' + status_1, this, request));
                    }
                }
            }
            ;
            xhr.onreadystatechange = xhrReadyStateChange;
            xhrReadyStateChange.subscriber = this;
            xhrReadyStateChange.progressSubscriber = progressSubscriber;
            xhrReadyStateChange.request = request;
        };
        AjaxSubscriber.prototype.unsubscribe = function () {
            var _a = this, done = _a.done, xhr = _a.xhr;
            if (!done && xhr && xhr.readyState !== 4 && typeof xhr.abort === 'function') {
                xhr.abort();
            }
            _super.prototype.unsubscribe.call(this);
        };
        return AjaxSubscriber;
    }(Subscriber_6.Subscriber));
    exports.AjaxSubscriber = AjaxSubscriber;
    var AjaxResponse = (function () {
        function AjaxResponse(originalEvent, xhr, request) {
            this.originalEvent = originalEvent;
            this.xhr = xhr;
            this.request = request;
            this.status = xhr.status;
            this.responseType = xhr.responseType || request.responseType;
            switch (this.responseType) {
                case 'json':
                    if ('response' in xhr) {
                        this.response = xhr.responseType ? xhr.response : JSON.parse(xhr.response || xhr.responseText || 'null');
                    }
                    else {
                        this.response = JSON.parse(xhr.responseText || 'null');
                    }
                    break;
                case 'xml':
                    this.response = xhr.responseXML;
                    break;
                case 'text':
                default:
                    this.response = ('response' in xhr) ? xhr.response : xhr.responseText;
                    break;
            }
        }
        return AjaxResponse;
    }());
    exports.AjaxResponse = AjaxResponse;
    var AjaxError = (function (_super) {
        __extends(AjaxError, _super);
        function AjaxError(message, xhr, request) {
            var _this = _super.call(this, message) || this;
            _this.message = message;
            _this.xhr = xhr;
            _this.request = request;
            _this.status = xhr.status;
            return _this;
        }
        return AjaxError;
    }(Error));
    exports.AjaxError = AjaxError;
    var AjaxTimeoutError = (function (_super) {
        __extends(AjaxTimeoutError, _super);
        function AjaxTimeoutError(xhr, request) {
            return _super.call(this, 'ajax timeout', xhr, request) || this;
        }
        return AjaxTimeoutError;
    }(AjaxError));
    exports.AjaxTimeoutError = AjaxTimeoutError;
});
define("node_modules/rxjs/src/observable/dom/MiscJSDoc", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AjaxRequestDoc = (function () {
        function AjaxRequestDoc() {
            this.url = '';
            this.body = 0;
            this.user = '';
            this.async = false;
            this.method = '';
            this.headers = null;
            this.timeout = 0;
            this.password = '';
            this.hasContent = false;
            this.crossDomain = false;
            this.progressSubscriber = null;
            this.responseType = '';
        }
        AjaxRequestDoc.prototype.createXHR = function () {
            return null;
        };
        AjaxRequestDoc.prototype.resultSelector = function (response) {
            return null;
        };
        return AjaxRequestDoc;
    }());
    exports.AjaxRequestDoc = AjaxRequestDoc;
});
define("node_modules/rxjs/src/MiscJSDoc", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/dom/MiscJSDoc"], function (require, exports, Observable_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ObservableDoc = (function () {
        function ObservableDoc() {
        }
        ObservableDoc.create = function (onSubscription) {
            return new Observable_6.Observable(onSubscription);
        };
        ;
        return ObservableDoc;
    }());
    exports.ObservableDoc = ObservableDoc;
    var ObserverDoc = (function () {
        function ObserverDoc() {
            this.closed = false;
        }
        ObserverDoc.prototype.next = function (value) {
            return void 0;
        };
        ObserverDoc.prototype.error = function (err) {
            return void 0;
        };
        ObserverDoc.prototype.complete = function () {
            return void 0;
        };
        return ObserverDoc;
    }());
    exports.ObserverDoc = ObserverDoc;
    var SubscribableOrPromiseDoc = (function () {
        function SubscribableOrPromiseDoc() {
        }
        return SubscribableOrPromiseDoc;
    }());
    exports.SubscribableOrPromiseDoc = SubscribableOrPromiseDoc;
    var ObservableInputDoc = (function () {
        function ObservableInputDoc() {
        }
        return ObservableInputDoc;
    }());
    exports.ObservableInputDoc = ObservableInputDoc;
    var TeardownLogicDoc = (function () {
        function TeardownLogicDoc() {
        }
        return TeardownLogicDoc;
    }());
    exports.TeardownLogicDoc = TeardownLogicDoc;
});
define("node_modules/rxjs/src/Notification", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Notification = (function () {
        function Notification(kind, value, error) {
            this.kind = kind;
            this.value = value;
            this.error = error;
            this.hasValue = kind === 'N';
        }
        Notification.prototype.observe = function (observer) {
            switch (this.kind) {
                case 'N':
                    return observer.next && observer.next(this.value);
                case 'E':
                    return observer.error && observer.error(this.error);
                case 'C':
                    return observer.complete && observer.complete();
            }
        };
        Notification.prototype.do = function (next, error, complete) {
            var kind = this.kind;
            switch (kind) {
                case 'N':
                    return next && next(this.value);
                case 'E':
                    return error && error(this.error);
                case 'C':
                    return complete && complete();
            }
        };
        Notification.prototype.accept = function (nextOrObserver, error, complete) {
            if (nextOrObserver && typeof nextOrObserver.next === 'function') {
                return this.observe(nextOrObserver);
            }
            else {
                return this.do(nextOrObserver, error, complete);
            }
        };
        Notification.prototype.toObservable = function () {
            var kind = this.kind;
            switch (kind) {
                case 'N':
                    return Observable_7.Observable.of(this.value);
                case 'E':
                    return Observable_7.Observable.throw(this.error);
                case 'C':
                    return Observable_7.Observable.empty();
            }
            throw new Error('unexpected notification kind value');
        };
        Notification.createNext = function (value) {
            if (typeof value !== 'undefined') {
                return new Notification('N', value);
            }
            return this.undefinedValueNotification;
        };
        Notification.createError = function (err) {
            return new Notification('E', undefined, err);
        };
        Notification.createComplete = function () {
            return this.completeNotification;
        };
        return Notification;
    }());
    Notification.completeNotification = new Notification('C');
    Notification.undefinedValueNotification = new Notification('N', undefined);
    exports.Notification = Notification;
});
define("node_modules/rxjs/src/scheduler/AsyncScheduler", ["require", "exports", "node_modules/rxjs/src/Scheduler"], function (require, exports, Scheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AsyncScheduler = (function (_super) {
        __extends(AsyncScheduler, _super);
        function AsyncScheduler() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.actions = [];
            _this.active = false;
            _this.scheduled = undefined;
            return _this;
        }
        AsyncScheduler.prototype.flush = function (action) {
            var actions = this.actions;
            if (this.active) {
                actions.push(action);
                return;
            }
            var error;
            this.active = true;
            do {
                if (error = action.execute(action.state, action.delay)) {
                    break;
                }
            } while (action = actions.shift());
            this.active = false;
            if (error) {
                while (action = actions.shift()) {
                    action.unsubscribe();
                }
                throw error;
            }
        };
        return AsyncScheduler;
    }(Scheduler_1.Scheduler));
    exports.AsyncScheduler = AsyncScheduler;
});
define("node_modules/rxjs/src/scheduler/AsyncAction", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/scheduler/Action"], function (require, exports, root_7, Action_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AsyncAction = (function (_super) {
        __extends(AsyncAction, _super);
        function AsyncAction(scheduler, work) {
            var _this = _super.call(this, scheduler, work) || this;
            _this.scheduler = scheduler;
            _this.work = work;
            _this.pending = false;
            return _this;
        }
        AsyncAction.prototype.schedule = function (state, delay) {
            if (delay === void 0) { delay = 0; }
            if (this.closed) {
                return this;
            }
            this.state = state;
            this.pending = true;
            var id = this.id;
            var scheduler = this.scheduler;
            if (id != null) {
                this.id = this.recycleAsyncId(scheduler, id, delay);
            }
            this.delay = delay;
            this.id = this.id || this.requestAsyncId(scheduler, this.id, delay);
            return this;
        };
        AsyncAction.prototype.requestAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            return root_7.root.setInterval(scheduler.flush.bind(scheduler, this), delay);
        };
        AsyncAction.prototype.recycleAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if (delay !== null && this.delay === delay) {
                return id;
            }
            return root_7.root.clearInterval(id) && undefined || undefined;
        };
        AsyncAction.prototype.execute = function (state, delay) {
            if (this.closed) {
                return new Error('executing a cancelled action');
            }
            this.pending = false;
            var error = this._execute(state, delay);
            if (error) {
                return error;
            }
            else if (this.pending === false && this.id != null) {
                this.id = this.recycleAsyncId(this.scheduler, this.id, null);
            }
        };
        AsyncAction.prototype._execute = function (state, delay) {
            var errored = false;
            var errorValue = undefined;
            try {
                this.work(state);
            }
            catch (e) {
                errored = true;
                errorValue = !!e && e || new Error(e);
            }
            if (errored) {
                this.unsubscribe();
                return errorValue;
            }
        };
        AsyncAction.prototype._unsubscribe = function () {
            var id = this.id;
            var scheduler = this.scheduler;
            var actions = scheduler.actions;
            var index = actions.indexOf(this);
            this.work = null;
            this.delay = null;
            this.state = null;
            this.pending = false;
            this.scheduler = null;
            if (index !== -1) {
                actions.splice(index, 1);
            }
            if (id != null) {
                this.id = this.recycleAsyncId(scheduler, id, null);
            }
        };
        return AsyncAction;
    }(Action_1.Action));
    exports.AsyncAction = AsyncAction;
});
define("node_modules/rxjs/src/scheduler/QueueScheduler", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncScheduler"], function (require, exports, AsyncScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var QueueScheduler = (function (_super) {
        __extends(QueueScheduler, _super);
        function QueueScheduler() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return QueueScheduler;
    }(AsyncScheduler_1.AsyncScheduler));
    exports.QueueScheduler = QueueScheduler;
});
define("node_modules/rxjs/src/scheduler/QueueAction", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncAction"], function (require, exports, AsyncAction_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var QueueAction = (function (_super) {
        __extends(QueueAction, _super);
        function QueueAction(scheduler, work) {
            var _this = _super.call(this, scheduler, work) || this;
            _this.scheduler = scheduler;
            _this.work = work;
            return _this;
        }
        QueueAction.prototype.schedule = function (state, delay) {
            if (delay === void 0) { delay = 0; }
            if (delay > 0) {
                return _super.prototype.schedule.call(this, state, delay);
            }
            this.delay = delay;
            this.state = state;
            this.scheduler.flush(this);
            return this;
        };
        QueueAction.prototype.execute = function (state, delay) {
            return (delay > 0 || this.closed) ?
                _super.prototype.execute.call(this, state, delay) :
                this._execute(state, delay);
        };
        QueueAction.prototype.requestAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if ((delay !== null && delay > 0) || (delay === null && this.delay > 0)) {
                return _super.prototype.requestAsyncId.call(this, scheduler, id, delay);
            }
            return scheduler.flush(this);
        };
        return QueueAction;
    }(AsyncAction_1.AsyncAction));
    exports.QueueAction = QueueAction;
});
define("node_modules/rxjs/src/scheduler/queue", ["require", "exports", "node_modules/rxjs/src/scheduler/QueueAction", "node_modules/rxjs/src/scheduler/QueueScheduler"], function (require, exports, QueueAction_1, QueueScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.queue = new QueueScheduler_1.QueueScheduler(QueueAction_1.QueueAction);
});
define("node_modules/rxjs/src/operator/observeOn", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Notification"], function (require, exports, Subscriber_7, Notification_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function observeOn(scheduler, delay) {
        if (delay === void 0) { delay = 0; }
        return this.lift(new ObserveOnOperator(scheduler, delay));
    }
    exports.observeOn = observeOn;
    var ObserveOnOperator = (function () {
        function ObserveOnOperator(scheduler, delay) {
            if (delay === void 0) { delay = 0; }
            this.scheduler = scheduler;
            this.delay = delay;
        }
        ObserveOnOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ObserveOnSubscriber(subscriber, this.scheduler, this.delay));
        };
        return ObserveOnOperator;
    }());
    exports.ObserveOnOperator = ObserveOnOperator;
    var ObserveOnSubscriber = (function (_super) {
        __extends(ObserveOnSubscriber, _super);
        function ObserveOnSubscriber(destination, scheduler, delay) {
            if (delay === void 0) { delay = 0; }
            var _this = _super.call(this, destination) || this;
            _this.scheduler = scheduler;
            _this.delay = delay;
            return _this;
        }
        ObserveOnSubscriber.dispatch = function (arg) {
            var notification = arg.notification, destination = arg.destination;
            notification.observe(destination);
            this.unsubscribe();
        };
        ObserveOnSubscriber.prototype.scheduleMessage = function (notification) {
            this.add(this.scheduler.schedule(ObserveOnSubscriber.dispatch, this.delay, new ObserveOnMessage(notification, this.destination)));
        };
        ObserveOnSubscriber.prototype._next = function (value) {
            this.scheduleMessage(Notification_1.Notification.createNext(value));
        };
        ObserveOnSubscriber.prototype._error = function (err) {
            this.scheduleMessage(Notification_1.Notification.createError(err));
        };
        ObserveOnSubscriber.prototype._complete = function () {
            this.scheduleMessage(Notification_1.Notification.createComplete());
        };
        return ObserveOnSubscriber;
    }(Subscriber_7.Subscriber));
    exports.ObserveOnSubscriber = ObserveOnSubscriber;
    var ObserveOnMessage = (function () {
        function ObserveOnMessage(notification, destination) {
            this.notification = notification;
            this.destination = destination;
        }
        return ObserveOnMessage;
    }());
    exports.ObserveOnMessage = ObserveOnMessage;
});
define("node_modules/rxjs/src/ReplaySubject", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/scheduler/queue", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/operator/observeOn", "node_modules/rxjs/src/util/ObjectUnsubscribedError", "node_modules/rxjs/src/SubjectSubscription"], function (require, exports, Subject_3, queue_1, Subscription_6, observeOn_1, ObjectUnsubscribedError_3, SubjectSubscription_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ReplaySubject = (function (_super) {
        __extends(ReplaySubject, _super);
        function ReplaySubject(bufferSize, windowTime, scheduler) {
            if (bufferSize === void 0) { bufferSize = Number.POSITIVE_INFINITY; }
            if (windowTime === void 0) { windowTime = Number.POSITIVE_INFINITY; }
            var _this = _super.call(this) || this;
            _this.scheduler = scheduler;
            _this._events = [];
            _this._bufferSize = bufferSize < 1 ? 1 : bufferSize;
            _this._windowTime = windowTime < 1 ? 1 : windowTime;
            return _this;
        }
        ReplaySubject.prototype.next = function (value) {
            var now = this._getNow();
            this._events.push(new ReplayEvent(now, value));
            this._trimBufferThenGetEvents();
            _super.prototype.next.call(this, value);
        };
        ReplaySubject.prototype._subscribe = function (subscriber) {
            var _events = this._trimBufferThenGetEvents();
            var scheduler = this.scheduler;
            var subscription;
            if (this.closed) {
                throw new ObjectUnsubscribedError_3.ObjectUnsubscribedError();
            }
            else if (this.hasError) {
                subscription = Subscription_6.Subscription.EMPTY;
            }
            else if (this.isStopped) {
                subscription = Subscription_6.Subscription.EMPTY;
            }
            else {
                this.observers.push(subscriber);
                subscription = new SubjectSubscription_2.SubjectSubscription(this, subscriber);
            }
            if (scheduler) {
                subscriber.add(subscriber = new observeOn_1.ObserveOnSubscriber(subscriber, scheduler));
            }
            var len = _events.length;
            for (var i = 0; i < len && !subscriber.closed; i++) {
                subscriber.next(_events[i].value);
            }
            if (this.hasError) {
                subscriber.error(this.thrownError);
            }
            else if (this.isStopped) {
                subscriber.complete();
            }
            return subscription;
        };
        ReplaySubject.prototype._getNow = function () {
            return (this.scheduler || queue_1.queue).now();
        };
        ReplaySubject.prototype._trimBufferThenGetEvents = function () {
            var now = this._getNow();
            var _bufferSize = this._bufferSize;
            var _windowTime = this._windowTime;
            var _events = this._events;
            var eventsCount = _events.length;
            var spliceCount = 0;
            while (spliceCount < eventsCount) {
                if ((now - _events[spliceCount].time) < _windowTime) {
                    break;
                }
                spliceCount++;
            }
            if (eventsCount > _bufferSize) {
                spliceCount = Math.max(spliceCount, eventsCount - _bufferSize);
            }
            if (spliceCount > 0) {
                _events.splice(0, spliceCount);
            }
            return _events;
        };
        return ReplaySubject;
    }(Subject_3.Subject));
    exports.ReplaySubject = ReplaySubject;
    var ReplayEvent = (function () {
        function ReplayEvent(time, value) {
            this.time = time;
            this.value = value;
        }
        return ReplayEvent;
    }());
});
define("node_modules/rxjs/src/observable/BoundCallbackObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/AsyncSubject"], function (require, exports, Observable_8, tryCatch_3, errorObject_4, AsyncSubject_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var BoundCallbackObservable = (function (_super) {
        __extends(BoundCallbackObservable, _super);
        function BoundCallbackObservable(callbackFunc, selector, args, context, scheduler) {
            var _this = _super.call(this) || this;
            _this.callbackFunc = callbackFunc;
            _this.selector = selector;
            _this.args = args;
            _this.context = context;
            _this.scheduler = scheduler;
            return _this;
        }
        BoundCallbackObservable.create = function (func, selector, scheduler) {
            if (selector === void 0) { selector = undefined; }
            return function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                return new BoundCallbackObservable(func, selector, args, this, scheduler);
            };
        };
        BoundCallbackObservable.prototype._subscribe = function (subscriber) {
            var callbackFunc = this.callbackFunc;
            var args = this.args;
            var scheduler = this.scheduler;
            var subject = this.subject;
            if (!scheduler) {
                if (!subject) {
                    subject = this.subject = new AsyncSubject_1.AsyncSubject();
                    var handler = function handlerFn() {
                        var innerArgs = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            innerArgs[_i] = arguments[_i];
                        }
                        var source = handlerFn.source;
                        var selector = source.selector, subject = source.subject;
                        if (selector) {
                            var result_1 = tryCatch_3.tryCatch(selector).apply(this, innerArgs);
                            if (result_1 === errorObject_4.errorObject) {
                                subject.error(errorObject_4.errorObject.e);
                            }
                            else {
                                subject.next(result_1);
                                subject.complete();
                            }
                        }
                        else {
                            subject.next(innerArgs.length <= 1 ? innerArgs[0] : innerArgs);
                            subject.complete();
                        }
                    };
                    handler.source = this;
                    var result = tryCatch_3.tryCatch(callbackFunc).apply(this.context, args.concat(handler));
                    if (result === errorObject_4.errorObject) {
                        subject.error(errorObject_4.errorObject.e);
                    }
                }
                return subject.subscribe(subscriber);
            }
            else {
                return scheduler.schedule(BoundCallbackObservable.dispatch, 0, { source: this, subscriber: subscriber, context: this.context });
            }
        };
        BoundCallbackObservable.dispatch = function (state) {
            var self = this;
            var source = state.source, subscriber = state.subscriber, context = state.context;
            var callbackFunc = source.callbackFunc, args = source.args, scheduler = source.scheduler;
            var subject = source.subject;
            if (!subject) {
                subject = source.subject = new AsyncSubject_1.AsyncSubject();
                var handler = function handlerFn() {
                    var innerArgs = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        innerArgs[_i] = arguments[_i];
                    }
                    var source = handlerFn.source;
                    var selector = source.selector, subject = source.subject;
                    if (selector) {
                        var result_2 = tryCatch_3.tryCatch(selector).apply(this, innerArgs);
                        if (result_2 === errorObject_4.errorObject) {
                            self.add(scheduler.schedule(dispatchError, 0, { err: errorObject_4.errorObject.e, subject: subject }));
                        }
                        else {
                            self.add(scheduler.schedule(dispatchNext, 0, { value: result_2, subject: subject }));
                        }
                    }
                    else {
                        var value = innerArgs.length <= 1 ? innerArgs[0] : innerArgs;
                        self.add(scheduler.schedule(dispatchNext, 0, { value: value, subject: subject }));
                    }
                };
                handler.source = source;
                var result = tryCatch_3.tryCatch(callbackFunc).apply(context, args.concat(handler));
                if (result === errorObject_4.errorObject) {
                    subject.error(errorObject_4.errorObject.e);
                }
            }
            self.add(subject.subscribe(subscriber));
        };
        return BoundCallbackObservable;
    }(Observable_8.Observable));
    exports.BoundCallbackObservable = BoundCallbackObservable;
    function dispatchNext(arg) {
        var value = arg.value, subject = arg.subject;
        subject.next(value);
        subject.complete();
    }
    function dispatchError(arg) {
        var err = arg.err, subject = arg.subject;
        subject.error(err);
    }
});
define("node_modules/rxjs/src/observable/bindCallback", ["require", "exports", "node_modules/rxjs/src/observable/BoundCallbackObservable"], function (require, exports, BoundCallbackObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bindCallback = BoundCallbackObservable_1.BoundCallbackObservable.create;
});
define("node_modules/rxjs/src/add/observable/bindCallback", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/bindCallback"], function (require, exports, Observable_9, bindCallback_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_9.Observable.bindCallback = bindCallback_1.bindCallback;
});
define("node_modules/rxjs/src/observable/BoundNodeCallbackObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/AsyncSubject"], function (require, exports, Observable_10, tryCatch_4, errorObject_5, AsyncSubject_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var BoundNodeCallbackObservable = (function (_super) {
        __extends(BoundNodeCallbackObservable, _super);
        function BoundNodeCallbackObservable(callbackFunc, selector, args, context, scheduler) {
            var _this = _super.call(this) || this;
            _this.callbackFunc = callbackFunc;
            _this.selector = selector;
            _this.args = args;
            _this.context = context;
            _this.scheduler = scheduler;
            return _this;
        }
        BoundNodeCallbackObservable.create = function (func, selector, scheduler) {
            if (selector === void 0) { selector = undefined; }
            return function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                return new BoundNodeCallbackObservable(func, selector, args, this, scheduler);
            };
        };
        BoundNodeCallbackObservable.prototype._subscribe = function (subscriber) {
            var callbackFunc = this.callbackFunc;
            var args = this.args;
            var scheduler = this.scheduler;
            var subject = this.subject;
            if (!scheduler) {
                if (!subject) {
                    subject = this.subject = new AsyncSubject_2.AsyncSubject();
                    var handler = function handlerFn() {
                        var innerArgs = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            innerArgs[_i] = arguments[_i];
                        }
                        var source = handlerFn.source;
                        var selector = source.selector, subject = source.subject;
                        var err = innerArgs.shift();
                        if (err) {
                            subject.error(err);
                        }
                        else if (selector) {
                            var result_3 = tryCatch_4.tryCatch(selector).apply(this, innerArgs);
                            if (result_3 === errorObject_5.errorObject) {
                                subject.error(errorObject_5.errorObject.e);
                            }
                            else {
                                subject.next(result_3);
                                subject.complete();
                            }
                        }
                        else {
                            subject.next(innerArgs.length <= 1 ? innerArgs[0] : innerArgs);
                            subject.complete();
                        }
                    };
                    handler.source = this;
                    var result = tryCatch_4.tryCatch(callbackFunc).apply(this.context, args.concat(handler));
                    if (result === errorObject_5.errorObject) {
                        subject.error(errorObject_5.errorObject.e);
                    }
                }
                return subject.subscribe(subscriber);
            }
            else {
                return scheduler.schedule(dispatch, 0, { source: this, subscriber: subscriber, context: this.context });
            }
        };
        return BoundNodeCallbackObservable;
    }(Observable_10.Observable));
    exports.BoundNodeCallbackObservable = BoundNodeCallbackObservable;
    function dispatch(state) {
        var self = this;
        var source = state.source, subscriber = state.subscriber, context = state.context;
        var _a = source, callbackFunc = _a.callbackFunc, args = _a.args, scheduler = _a.scheduler;
        var subject = source.subject;
        if (!subject) {
            subject = source.subject = new AsyncSubject_2.AsyncSubject();
            var handler = function handlerFn() {
                var innerArgs = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    innerArgs[_i] = arguments[_i];
                }
                var source = handlerFn.source;
                var selector = source.selector, subject = source.subject;
                var err = innerArgs.shift();
                if (err) {
                    self.add(scheduler.schedule(dispatchError, 0, { err: err, subject: subject }));
                }
                else if (selector) {
                    var result_4 = tryCatch_4.tryCatch(selector).apply(this, innerArgs);
                    if (result_4 === errorObject_5.errorObject) {
                        self.add(scheduler.schedule(dispatchError, 0, { err: errorObject_5.errorObject.e, subject: subject }));
                    }
                    else {
                        self.add(scheduler.schedule(dispatchNext, 0, { value: result_4, subject: subject }));
                    }
                }
                else {
                    var value = innerArgs.length <= 1 ? innerArgs[0] : innerArgs;
                    self.add(scheduler.schedule(dispatchNext, 0, { value: value, subject: subject }));
                }
            };
            handler.source = source;
            var result = tryCatch_4.tryCatch(callbackFunc).apply(context, args.concat(handler));
            if (result === errorObject_5.errorObject) {
                self.add(scheduler.schedule(dispatchError, 0, { err: errorObject_5.errorObject.e, subject: subject }));
            }
        }
        self.add(subject.subscribe(subscriber));
    }
    function dispatchNext(arg) {
        var value = arg.value, subject = arg.subject;
        subject.next(value);
        subject.complete();
    }
    function dispatchError(arg) {
        var err = arg.err, subject = arg.subject;
        subject.error(err);
    }
});
define("node_modules/rxjs/src/observable/bindNodeCallback", ["require", "exports", "node_modules/rxjs/src/observable/BoundNodeCallbackObservable"], function (require, exports, BoundNodeCallbackObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bindNodeCallback = BoundNodeCallbackObservable_1.BoundNodeCallbackObservable.create;
});
define("node_modules/rxjs/src/add/observable/bindNodeCallback", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/bindNodeCallback"], function (require, exports, Observable_11, bindNodeCallback_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_11.Observable.bindNodeCallback = bindNodeCallback_1.bindNodeCallback;
});
define("node_modules/rxjs/src/util/isScheduler", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isScheduler(value) {
        return value && typeof value.schedule === 'function';
    }
    exports.isScheduler = isScheduler;
});
define("node_modules/rxjs/src/observable/ScalarObservable", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ScalarObservable = (function (_super) {
        __extends(ScalarObservable, _super);
        function ScalarObservable(value, scheduler) {
            var _this = _super.call(this) || this;
            _this.value = value;
            _this.scheduler = scheduler;
            _this._isScalar = true;
            if (scheduler) {
                _this._isScalar = false;
            }
            return _this;
        }
        ScalarObservable.create = function (value, scheduler) {
            return new ScalarObservable(value, scheduler);
        };
        ScalarObservable.dispatch = function (state) {
            var done = state.done, value = state.value, subscriber = state.subscriber;
            if (done) {
                subscriber.complete();
                return;
            }
            subscriber.next(value);
            if (subscriber.closed) {
                return;
            }
            state.done = true;
            this.schedule(state);
        };
        ScalarObservable.prototype._subscribe = function (subscriber) {
            var value = this.value;
            var scheduler = this.scheduler;
            if (scheduler) {
                return scheduler.schedule(ScalarObservable.dispatch, 0, {
                    done: false, value: value, subscriber: subscriber
                });
            }
            else {
                subscriber.next(value);
                if (!subscriber.closed) {
                    subscriber.complete();
                }
            }
        };
        return ScalarObservable;
    }(Observable_12.Observable));
    exports.ScalarObservable = ScalarObservable;
});
define("node_modules/rxjs/src/observable/EmptyObservable", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_13) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var EmptyObservable = (function (_super) {
        __extends(EmptyObservable, _super);
        function EmptyObservable(scheduler) {
            var _this = _super.call(this) || this;
            _this.scheduler = scheduler;
            return _this;
        }
        EmptyObservable.create = function (scheduler) {
            return new EmptyObservable(scheduler);
        };
        EmptyObservable.dispatch = function (arg) {
            var subscriber = arg.subscriber;
            subscriber.complete();
        };
        EmptyObservable.prototype._subscribe = function (subscriber) {
            var scheduler = this.scheduler;
            if (scheduler) {
                return scheduler.schedule(EmptyObservable.dispatch, 0, { subscriber: subscriber });
            }
            else {
                subscriber.complete();
            }
        };
        return EmptyObservable;
    }(Observable_13.Observable));
    exports.EmptyObservable = EmptyObservable;
});
define("node_modules/rxjs/src/observable/ArrayObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/ScalarObservable", "node_modules/rxjs/src/observable/EmptyObservable", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, Observable_14, ScalarObservable_1, EmptyObservable_1, isScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ArrayObservable = (function (_super) {
        __extends(ArrayObservable, _super);
        function ArrayObservable(array, scheduler) {
            var _this = _super.call(this) || this;
            _this.array = array;
            _this.scheduler = scheduler;
            if (!scheduler && array.length === 1) {
                _this._isScalar = true;
                _this.value = array[0];
            }
            return _this;
        }
        ArrayObservable.create = function (array, scheduler) {
            return new ArrayObservable(array, scheduler);
        };
        ArrayObservable.of = function () {
            var array = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                array[_i] = arguments[_i];
            }
            var scheduler = array[array.length - 1];
            if (isScheduler_1.isScheduler(scheduler)) {
                array.pop();
            }
            else {
                scheduler = null;
            }
            var len = array.length;
            if (len > 1) {
                return new ArrayObservable(array, scheduler);
            }
            else if (len === 1) {
                return new ScalarObservable_1.ScalarObservable(array[0], scheduler);
            }
            else {
                return new EmptyObservable_1.EmptyObservable(scheduler);
            }
        };
        ArrayObservable.dispatch = function (state) {
            var array = state.array, index = state.index, count = state.count, subscriber = state.subscriber;
            if (index >= count) {
                subscriber.complete();
                return;
            }
            subscriber.next(array[index]);
            if (subscriber.closed) {
                return;
            }
            state.index = index + 1;
            this.schedule(state);
        };
        ArrayObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var array = this.array;
            var count = array.length;
            var scheduler = this.scheduler;
            if (scheduler) {
                return scheduler.schedule(ArrayObservable.dispatch, 0, {
                    array: array, index: index, count: count, subscriber: subscriber
                });
            }
            else {
                for (var i = 0; i < count && !subscriber.closed; i++) {
                    subscriber.next(array[i]);
                }
                subscriber.complete();
            }
        };
        return ArrayObservable;
    }(Observable_14.Observable));
    exports.ArrayObservable = ArrayObservable;
});
define("node_modules/rxjs/src/operator/combineLatest", ["require", "exports", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, ArrayObservable_1, isArray_2, OuterSubscriber_2, subscribeToResult_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var none = {};
    function combineLatest() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        var project = null;
        if (typeof observables[observables.length - 1] === 'function') {
            project = observables.pop();
        }
        if (observables.length === 1 && isArray_2.isArray(observables[0])) {
            observables = observables[0].slice();
        }
        observables.unshift(this);
        return this.lift.call(new ArrayObservable_1.ArrayObservable(observables), new CombineLatestOperator(project));
    }
    exports.combineLatest = combineLatest;
    var CombineLatestOperator = (function () {
        function CombineLatestOperator(project) {
            this.project = project;
        }
        CombineLatestOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new CombineLatestSubscriber(subscriber, this.project));
        };
        return CombineLatestOperator;
    }());
    exports.CombineLatestOperator = CombineLatestOperator;
    var CombineLatestSubscriber = (function (_super) {
        __extends(CombineLatestSubscriber, _super);
        function CombineLatestSubscriber(destination, project) {
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.active = 0;
            _this.values = [];
            _this.observables = [];
            return _this;
        }
        CombineLatestSubscriber.prototype._next = function (observable) {
            this.values.push(none);
            this.observables.push(observable);
        };
        CombineLatestSubscriber.prototype._complete = function () {
            var observables = this.observables;
            var len = observables.length;
            if (len === 0) {
                this.destination.complete();
            }
            else {
                this.active = len;
                this.toRespond = len;
                for (var i = 0; i < len; i++) {
                    var observable = observables[i];
                    this.add(subscribeToResult_2.subscribeToResult(this, observable, observable, i));
                }
            }
        };
        CombineLatestSubscriber.prototype.notifyComplete = function (unused) {
            if ((this.active -= 1) === 0) {
                this.destination.complete();
            }
        };
        CombineLatestSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var values = this.values;
            var oldVal = values[outerIndex];
            var toRespond = !this.toRespond
                ? 0
                : oldVal === none ? --this.toRespond : this.toRespond;
            values[outerIndex] = innerValue;
            if (toRespond === 0) {
                if (this.project) {
                    this._tryProject(values);
                }
                else {
                    this.destination.next(values.slice());
                }
            }
        };
        CombineLatestSubscriber.prototype._tryProject = function (values) {
            var result;
            try {
                result = this.project.apply(this, values);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        return CombineLatestSubscriber;
    }(OuterSubscriber_2.OuterSubscriber));
    exports.CombineLatestSubscriber = CombineLatestSubscriber;
});
define("node_modules/rxjs/src/observable/combineLatest", ["require", "exports", "node_modules/rxjs/src/util/isScheduler", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/operator/combineLatest"], function (require, exports, isScheduler_2, isArray_3, ArrayObservable_2, combineLatest_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function combineLatest() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        var project = null;
        var scheduler = null;
        if (isScheduler_2.isScheduler(observables[observables.length - 1])) {
            scheduler = observables.pop();
        }
        if (typeof observables[observables.length - 1] === 'function') {
            project = observables.pop();
        }
        if (observables.length === 1 && isArray_3.isArray(observables[0])) {
            observables = observables[0];
        }
        return new ArrayObservable_2.ArrayObservable(observables, scheduler).lift(new combineLatest_1.CombineLatestOperator(project));
    }
    exports.combineLatest = combineLatest;
});
define("node_modules/rxjs/src/add/observable/combineLatest", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/combineLatest"], function (require, exports, Observable_15, combineLatest_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_15.Observable.combineLatest = combineLatest_2.combineLatest;
});
define("node_modules/rxjs/src/operator/mergeAll", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_3, subscribeToResult_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function mergeAll(concurrent) {
        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
        return this.lift(new MergeAllOperator(concurrent));
    }
    exports.mergeAll = mergeAll;
    var MergeAllOperator = (function () {
        function MergeAllOperator(concurrent) {
            this.concurrent = concurrent;
        }
        MergeAllOperator.prototype.call = function (observer, source) {
            return source.subscribe(new MergeAllSubscriber(observer, this.concurrent));
        };
        return MergeAllOperator;
    }());
    exports.MergeAllOperator = MergeAllOperator;
    var MergeAllSubscriber = (function (_super) {
        __extends(MergeAllSubscriber, _super);
        function MergeAllSubscriber(destination, concurrent) {
            var _this = _super.call(this, destination) || this;
            _this.concurrent = concurrent;
            _this.hasCompleted = false;
            _this.buffer = [];
            _this.active = 0;
            return _this;
        }
        MergeAllSubscriber.prototype._next = function (observable) {
            if (this.active < this.concurrent) {
                this.active++;
                this.add(subscribeToResult_3.subscribeToResult(this, observable));
            }
            else {
                this.buffer.push(observable);
            }
        };
        MergeAllSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.active === 0 && this.buffer.length === 0) {
                this.destination.complete();
            }
        };
        MergeAllSubscriber.prototype.notifyComplete = function (innerSub) {
            var buffer = this.buffer;
            this.remove(innerSub);
            this.active--;
            if (buffer.length > 0) {
                this._next(buffer.shift());
            }
            else if (this.active === 0 && this.hasCompleted) {
                this.destination.complete();
            }
        };
        return MergeAllSubscriber;
    }(OuterSubscriber_3.OuterSubscriber));
    exports.MergeAllSubscriber = MergeAllSubscriber;
});
define("node_modules/rxjs/src/operator/concat", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/isScheduler", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/operator/mergeAll"], function (require, exports, Observable_16, isScheduler_3, ArrayObservable_3, mergeAll_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function concat() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        return this.lift.call(concatStatic.apply(void 0, [this].concat(observables)));
    }
    exports.concat = concat;
    function concatStatic() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        var scheduler = null;
        var args = observables;
        if (isScheduler_3.isScheduler(args[observables.length - 1])) {
            scheduler = args.pop();
        }
        if (scheduler === null && observables.length === 1 && observables[0] instanceof Observable_16.Observable) {
            return observables[0];
        }
        return new ArrayObservable_3.ArrayObservable(observables, scheduler).lift(new mergeAll_1.MergeAllOperator(1));
    }
    exports.concatStatic = concatStatic;
});
define("node_modules/rxjs/src/observable/concat", ["require", "exports", "node_modules/rxjs/src/operator/concat"], function (require, exports, concat_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.concat = concat_1.concatStatic;
});
define("node_modules/rxjs/src/add/observable/concat", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/concat"], function (require, exports, Observable_17, concat_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_17.Observable.concat = concat_2.concat;
});
define("node_modules/rxjs/src/observable/DeferObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, Observable_18, subscribeToResult_4, OuterSubscriber_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var DeferObservable = (function (_super) {
        __extends(DeferObservable, _super);
        function DeferObservable(observableFactory) {
            var _this = _super.call(this) || this;
            _this.observableFactory = observableFactory;
            return _this;
        }
        DeferObservable.create = function (observableFactory) {
            return new DeferObservable(observableFactory);
        };
        DeferObservable.prototype._subscribe = function (subscriber) {
            return new DeferSubscriber(subscriber, this.observableFactory);
        };
        return DeferObservable;
    }(Observable_18.Observable));
    exports.DeferObservable = DeferObservable;
    var DeferSubscriber = (function (_super) {
        __extends(DeferSubscriber, _super);
        function DeferSubscriber(destination, factory) {
            var _this = _super.call(this, destination) || this;
            _this.factory = factory;
            _this.tryDefer();
            return _this;
        }
        DeferSubscriber.prototype.tryDefer = function () {
            try {
                this._callFactory();
            }
            catch (err) {
                this._error(err);
            }
        };
        DeferSubscriber.prototype._callFactory = function () {
            var result = this.factory();
            if (result) {
                this.add(subscribeToResult_4.subscribeToResult(this, result));
            }
        };
        return DeferSubscriber;
    }(OuterSubscriber_4.OuterSubscriber));
});
define("node_modules/rxjs/src/observable/defer", ["require", "exports", "node_modules/rxjs/src/observable/DeferObservable"], function (require, exports, DeferObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.defer = DeferObservable_1.DeferObservable.create;
});
define("node_modules/rxjs/src/add/observable/defer", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/defer"], function (require, exports, Observable_19, defer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_19.Observable.defer = defer_1.defer;
});
define("node_modules/rxjs/src/observable/empty", ["require", "exports", "node_modules/rxjs/src/observable/EmptyObservable"], function (require, exports, EmptyObservable_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.empty = EmptyObservable_2.EmptyObservable.create;
});
define("node_modules/rxjs/src/add/observable/empty", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/empty"], function (require, exports, Observable_20, empty_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_20.Observable.empty = empty_1.empty;
});
define("node_modules/rxjs/src/observable/ForkJoinObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/EmptyObservable", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, Observable_21, EmptyObservable_3, isArray_4, subscribeToResult_5, OuterSubscriber_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ForkJoinObservable = (function (_super) {
        __extends(ForkJoinObservable, _super);
        function ForkJoinObservable(sources, resultSelector) {
            var _this = _super.call(this) || this;
            _this.sources = sources;
            _this.resultSelector = resultSelector;
            return _this;
        }
        ForkJoinObservable.create = function () {
            var sources = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                sources[_i] = arguments[_i];
            }
            if (sources === null || arguments.length === 0) {
                return new EmptyObservable_3.EmptyObservable();
            }
            var resultSelector = null;
            if (typeof sources[sources.length - 1] === 'function') {
                resultSelector = sources.pop();
            }
            if (sources.length === 1 && isArray_4.isArray(sources[0])) {
                sources = sources[0];
            }
            if (sources.length === 0) {
                return new EmptyObservable_3.EmptyObservable();
            }
            return new ForkJoinObservable(sources, resultSelector);
        };
        ForkJoinObservable.prototype._subscribe = function (subscriber) {
            return new ForkJoinSubscriber(subscriber, this.sources, this.resultSelector);
        };
        return ForkJoinObservable;
    }(Observable_21.Observable));
    exports.ForkJoinObservable = ForkJoinObservable;
    var ForkJoinSubscriber = (function (_super) {
        __extends(ForkJoinSubscriber, _super);
        function ForkJoinSubscriber(destination, sources, resultSelector) {
            var _this = _super.call(this, destination) || this;
            _this.sources = sources;
            _this.resultSelector = resultSelector;
            _this.completed = 0;
            _this.haveValues = 0;
            var len = sources.length;
            _this.total = len;
            _this.values = new Array(len);
            for (var i = 0; i < len; i++) {
                var source = sources[i];
                var innerSubscription = subscribeToResult_5.subscribeToResult(_this, source, null, i);
                if (innerSubscription) {
                    innerSubscription.outerIndex = i;
                    _this.add(innerSubscription);
                }
            }
            return _this;
        }
        ForkJoinSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.values[outerIndex] = innerValue;
            if (!innerSub._hasValue) {
                innerSub._hasValue = true;
                this.haveValues++;
            }
        };
        ForkJoinSubscriber.prototype.notifyComplete = function (innerSub) {
            var destination = this.destination;
            var _a = this, haveValues = _a.haveValues, resultSelector = _a.resultSelector, values = _a.values;
            var len = values.length;
            if (!innerSub._hasValue) {
                destination.complete();
                return;
            }
            this.completed++;
            if (this.completed !== len) {
                return;
            }
            if (haveValues === len) {
                var value = resultSelector ? resultSelector.apply(this, values) : values;
                destination.next(value);
            }
            destination.complete();
        };
        return ForkJoinSubscriber;
    }(OuterSubscriber_5.OuterSubscriber));
});
define("node_modules/rxjs/src/observable/forkJoin", ["require", "exports", "node_modules/rxjs/src/observable/ForkJoinObservable"], function (require, exports, ForkJoinObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.forkJoin = ForkJoinObservable_1.ForkJoinObservable.create;
});
define("node_modules/rxjs/src/add/observable/forkJoin", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/forkJoin"], function (require, exports, Observable_22, forkJoin_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_22.Observable.forkJoin = forkJoin_1.forkJoin;
});
define("node_modules/rxjs/src/observable/PromiseObservable", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/Observable"], function (require, exports, root_8, Observable_23) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var PromiseObservable = (function (_super) {
        __extends(PromiseObservable, _super);
        function PromiseObservable(promise, scheduler) {
            var _this = _super.call(this) || this;
            _this.promise = promise;
            _this.scheduler = scheduler;
            return _this;
        }
        PromiseObservable.create = function (promise, scheduler) {
            return new PromiseObservable(promise, scheduler);
        };
        PromiseObservable.prototype._subscribe = function (subscriber) {
            var _this = this;
            var promise = this.promise;
            var scheduler = this.scheduler;
            if (scheduler == null) {
                if (this._isScalar) {
                    if (!subscriber.closed) {
                        subscriber.next(this.value);
                        subscriber.complete();
                    }
                }
                else {
                    promise.then(function (value) {
                        _this.value = value;
                        _this._isScalar = true;
                        if (!subscriber.closed) {
                            subscriber.next(value);
                            subscriber.complete();
                        }
                    }, function (err) {
                        if (!subscriber.closed) {
                            subscriber.error(err);
                        }
                    })
                        .then(null, function (err) {
                        root_8.root.setTimeout(function () { throw err; });
                    });
                }
            }
            else {
                if (this._isScalar) {
                    if (!subscriber.closed) {
                        return scheduler.schedule(dispatchNext, 0, { value: this.value, subscriber: subscriber });
                    }
                }
                else {
                    promise.then(function (value) {
                        _this.value = value;
                        _this._isScalar = true;
                        if (!subscriber.closed) {
                            subscriber.add(scheduler.schedule(dispatchNext, 0, { value: value, subscriber: subscriber }));
                        }
                    }, function (err) {
                        if (!subscriber.closed) {
                            subscriber.add(scheduler.schedule(dispatchError, 0, { err: err, subscriber: subscriber }));
                        }
                    })
                        .then(null, function (err) {
                        root_8.root.setTimeout(function () { throw err; });
                    });
                }
            }
        };
        return PromiseObservable;
    }(Observable_23.Observable));
    exports.PromiseObservable = PromiseObservable;
    function dispatchNext(arg) {
        var value = arg.value, subscriber = arg.subscriber;
        if (!subscriber.closed) {
            subscriber.next(value);
            subscriber.complete();
        }
    }
    function dispatchError(arg) {
        var err = arg.err, subscriber = arg.subscriber;
        if (!subscriber.closed) {
            subscriber.error(err);
        }
    }
});
define("node_modules/rxjs/src/observable/IteratorObservable", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/symbol/iterator"], function (require, exports, root_9, Observable_24, iterator_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var IteratorObservable = (function (_super) {
        __extends(IteratorObservable, _super);
        function IteratorObservable(iterator, scheduler) {
            var _this = _super.call(this) || this;
            _this.scheduler = scheduler;
            if (iterator == null) {
                throw new Error('iterator cannot be null.');
            }
            _this.iterator = getIterator(iterator);
            return _this;
        }
        IteratorObservable.create = function (iterator, scheduler) {
            return new IteratorObservable(iterator, scheduler);
        };
        IteratorObservable.dispatch = function (state) {
            var index = state.index, hasError = state.hasError, iterator = state.iterator, subscriber = state.subscriber;
            if (hasError) {
                subscriber.error(state.error);
                return;
            }
            var result = iterator.next();
            if (result.done) {
                subscriber.complete();
                return;
            }
            subscriber.next(result.value);
            state.index = index + 1;
            if (subscriber.closed) {
                if (typeof iterator.return === 'function') {
                    iterator.return();
                }
                return;
            }
            this.schedule(state);
        };
        IteratorObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var _a = this, iterator = _a.iterator, scheduler = _a.scheduler;
            if (scheduler) {
                return scheduler.schedule(IteratorObservable.dispatch, 0, {
                    index: index, iterator: iterator, subscriber: subscriber
                });
            }
            else {
                do {
                    var result = iterator.next();
                    if (result.done) {
                        subscriber.complete();
                        break;
                    }
                    else {
                        subscriber.next(result.value);
                    }
                    if (subscriber.closed) {
                        if (typeof iterator.return === 'function') {
                            iterator.return();
                        }
                        break;
                    }
                } while (true);
            }
        };
        return IteratorObservable;
    }(Observable_24.Observable));
    exports.IteratorObservable = IteratorObservable;
    var StringIterator = (function () {
        function StringIterator(str, idx, len) {
            if (idx === void 0) { idx = 0; }
            if (len === void 0) { len = str.length; }
            this.str = str;
            this.idx = idx;
            this.len = len;
        }
        StringIterator.prototype[iterator_2.iterator] = function () { return (this); };
        StringIterator.prototype.next = function () {
            return this.idx < this.len ? {
                done: false,
                value: this.str.charAt(this.idx++)
            } : {
                done: true,
                value: undefined
            };
        };
        return StringIterator;
    }());
    var ArrayIterator = (function () {
        function ArrayIterator(arr, idx, len) {
            if (idx === void 0) { idx = 0; }
            if (len === void 0) { len = toLength(arr); }
            this.arr = arr;
            this.idx = idx;
            this.len = len;
        }
        ArrayIterator.prototype[iterator_2.iterator] = function () { return this; };
        ArrayIterator.prototype.next = function () {
            return this.idx < this.len ? {
                done: false,
                value: this.arr[this.idx++]
            } : {
                done: true,
                value: undefined
            };
        };
        return ArrayIterator;
    }());
    function getIterator(obj) {
        var i = obj[iterator_2.iterator];
        if (!i && typeof obj === 'string') {
            return new StringIterator(obj);
        }
        if (!i && obj.length !== undefined) {
            return new ArrayIterator(obj);
        }
        if (!i) {
            throw new TypeError('object is not iterable');
        }
        return obj[iterator_2.iterator]();
    }
    var maxSafeInteger = Math.pow(2, 53) - 1;
    function toLength(o) {
        var len = +o.length;
        if (isNaN(len)) {
            return 0;
        }
        if (len === 0 || !numberIsFinite(len)) {
            return len;
        }
        len = sign(len) * Math.floor(Math.abs(len));
        if (len <= 0) {
            return 0;
        }
        if (len > maxSafeInteger) {
            return maxSafeInteger;
        }
        return len;
    }
    function numberIsFinite(value) {
        return typeof value === 'number' && root_9.root.isFinite(value);
    }
    function sign(value) {
        var valueAsNumber = +value;
        if (valueAsNumber === 0) {
            return valueAsNumber;
        }
        if (isNaN(valueAsNumber)) {
            return valueAsNumber;
        }
        return valueAsNumber < 0 ? -1 : 1;
    }
});
define("node_modules/rxjs/src/observable/ArrayLikeObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/ScalarObservable", "node_modules/rxjs/src/observable/EmptyObservable"], function (require, exports, Observable_25, ScalarObservable_2, EmptyObservable_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ArrayLikeObservable = (function (_super) {
        __extends(ArrayLikeObservable, _super);
        function ArrayLikeObservable(arrayLike, scheduler) {
            var _this = _super.call(this) || this;
            _this.arrayLike = arrayLike;
            _this.scheduler = scheduler;
            if (!scheduler && arrayLike.length === 1) {
                _this._isScalar = true;
                _this.value = arrayLike[0];
            }
            return _this;
        }
        ArrayLikeObservable.create = function (arrayLike, scheduler) {
            var length = arrayLike.length;
            if (length === 0) {
                return new EmptyObservable_4.EmptyObservable();
            }
            else if (length === 1) {
                return new ScalarObservable_2.ScalarObservable(arrayLike[0], scheduler);
            }
            else {
                return new ArrayLikeObservable(arrayLike, scheduler);
            }
        };
        ArrayLikeObservable.dispatch = function (state) {
            var arrayLike = state.arrayLike, index = state.index, length = state.length, subscriber = state.subscriber;
            if (subscriber.closed) {
                return;
            }
            if (index >= length) {
                subscriber.complete();
                return;
            }
            subscriber.next(arrayLike[index]);
            state.index = index + 1;
            this.schedule(state);
        };
        ArrayLikeObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var _a = this, arrayLike = _a.arrayLike, scheduler = _a.scheduler;
            var length = arrayLike.length;
            if (scheduler) {
                return scheduler.schedule(ArrayLikeObservable.dispatch, 0, {
                    arrayLike: arrayLike, index: index, length: length, subscriber: subscriber
                });
            }
            else {
                for (var i = 0; i < length && !subscriber.closed; i++) {
                    subscriber.next(arrayLike[i]);
                }
                subscriber.complete();
            }
        };
        return ArrayLikeObservable;
    }(Observable_25.Observable));
    exports.ArrayLikeObservable = ArrayLikeObservable;
});
define("node_modules/rxjs/src/observable/FromObservable", ["require", "exports", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/util/isArrayLike", "node_modules/rxjs/src/util/isPromise", "node_modules/rxjs/src/observable/PromiseObservable", "node_modules/rxjs/src/observable/IteratorObservable", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/observable/ArrayLikeObservable", "node_modules/rxjs/src/symbol/iterator", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/observeOn", "node_modules/rxjs/src/symbol/observable"], function (require, exports, isArray_5, isArrayLike_2, isPromise_2, PromiseObservable_1, IteratorObservable_1, ArrayObservable_4, ArrayLikeObservable_1, iterator_3, Observable_26, observeOn_2, observable_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var FromObservable = (function (_super) {
        __extends(FromObservable, _super);
        function FromObservable(ish, scheduler) {
            var _this = _super.call(this, null) || this;
            _this.ish = ish;
            _this.scheduler = scheduler;
            return _this;
        }
        FromObservable.create = function (ish, scheduler) {
            if (ish != null) {
                if (typeof ish[observable_3.observable] === 'function') {
                    if (ish instanceof Observable_26.Observable && !scheduler) {
                        return ish;
                    }
                    return new FromObservable(ish, scheduler);
                }
                else if (isArray_5.isArray(ish)) {
                    return new ArrayObservable_4.ArrayObservable(ish, scheduler);
                }
                else if (isPromise_2.isPromise(ish)) {
                    return new PromiseObservable_1.PromiseObservable(ish, scheduler);
                }
                else if (typeof ish[iterator_3.iterator] === 'function' || typeof ish === 'string') {
                    return new IteratorObservable_1.IteratorObservable(ish, scheduler);
                }
                else if (isArrayLike_2.isArrayLike(ish)) {
                    return new ArrayLikeObservable_1.ArrayLikeObservable(ish, scheduler);
                }
            }
            throw new TypeError((ish !== null && typeof ish || ish) + ' is not observable');
        };
        FromObservable.prototype._subscribe = function (subscriber) {
            var ish = this.ish;
            var scheduler = this.scheduler;
            if (scheduler == null) {
                return ish[observable_3.observable]().subscribe(subscriber);
            }
            else {
                return ish[observable_3.observable]().subscribe(new observeOn_2.ObserveOnSubscriber(subscriber, scheduler, 0));
            }
        };
        return FromObservable;
    }(Observable_26.Observable));
    exports.FromObservable = FromObservable;
});
define("node_modules/rxjs/src/observable/from", ["require", "exports", "node_modules/rxjs/src/observable/FromObservable"], function (require, exports, FromObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.from = FromObservable_1.FromObservable.create;
});
define("node_modules/rxjs/src/add/observable/from", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/from"], function (require, exports, Observable_27, from_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_27.Observable.from = from_1.from;
});
define("node_modules/rxjs/src/observable/FromEventObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/isFunction", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/Subscription"], function (require, exports, Observable_28, tryCatch_5, isFunction_3, errorObject_6, Subscription_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var toString = Object.prototype.toString;
    function isNodeStyleEventEmitter(sourceObj) {
        return !!sourceObj && typeof sourceObj.addListener === 'function' && typeof sourceObj.removeListener === 'function';
    }
    function isJQueryStyleEventEmitter(sourceObj) {
        return !!sourceObj && typeof sourceObj.on === 'function' && typeof sourceObj.off === 'function';
    }
    function isNodeList(sourceObj) {
        return !!sourceObj && toString.call(sourceObj) === '[object NodeList]';
    }
    function isHTMLCollection(sourceObj) {
        return !!sourceObj && toString.call(sourceObj) === '[object HTMLCollection]';
    }
    function isEventTarget(sourceObj) {
        return !!sourceObj && typeof sourceObj.addEventListener === 'function' && typeof sourceObj.removeEventListener === 'function';
    }
    var FromEventObservable = (function (_super) {
        __extends(FromEventObservable, _super);
        function FromEventObservable(sourceObj, eventName, selector, options) {
            var _this = _super.call(this) || this;
            _this.sourceObj = sourceObj;
            _this.eventName = eventName;
            _this.selector = selector;
            _this.options = options;
            return _this;
        }
        FromEventObservable.create = function (target, eventName, options, selector) {
            if (isFunction_3.isFunction(options)) {
                selector = options;
                options = undefined;
            }
            return new FromEventObservable(target, eventName, selector, options);
        };
        FromEventObservable.setupSubscription = function (sourceObj, eventName, handler, subscriber, options) {
            var unsubscribe;
            if (isNodeList(sourceObj) || isHTMLCollection(sourceObj)) {
                for (var i = 0, len = sourceObj.length; i < len; i++) {
                    FromEventObservable.setupSubscription(sourceObj[i], eventName, handler, subscriber, options);
                }
            }
            else if (isEventTarget(sourceObj)) {
                var source_1 = sourceObj;
                sourceObj.addEventListener(eventName, handler, options);
                unsubscribe = function () { return source_1.removeEventListener(eventName, handler); };
            }
            else if (isJQueryStyleEventEmitter(sourceObj)) {
                var source_2 = sourceObj;
                sourceObj.on(eventName, handler);
                unsubscribe = function () { return source_2.off(eventName, handler); };
            }
            else if (isNodeStyleEventEmitter(sourceObj)) {
                var source_3 = sourceObj;
                sourceObj.addListener(eventName, handler);
                unsubscribe = function () { return source_3.removeListener(eventName, handler); };
            }
            else {
                throw new TypeError('Invalid event target');
            }
            subscriber.add(new Subscription_7.Subscription(unsubscribe));
        };
        FromEventObservable.prototype._subscribe = function (subscriber) {
            var sourceObj = this.sourceObj;
            var eventName = this.eventName;
            var options = this.options;
            var selector = this.selector;
            var handler = selector ? function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var result = tryCatch_5.tryCatch(selector).apply(void 0, args);
                if (result === errorObject_6.errorObject) {
                    subscriber.error(errorObject_6.errorObject.e);
                }
                else {
                    subscriber.next(result);
                }
            } : function (e) { return subscriber.next(e); };
            FromEventObservable.setupSubscription(sourceObj, eventName, handler, subscriber, options);
        };
        return FromEventObservable;
    }(Observable_28.Observable));
    exports.FromEventObservable = FromEventObservable;
});
define("node_modules/rxjs/src/observable/fromEvent", ["require", "exports", "node_modules/rxjs/src/observable/FromEventObservable"], function (require, exports, FromEventObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fromEvent = FromEventObservable_1.FromEventObservable.create;
});
define("node_modules/rxjs/src/add/observable/fromEvent", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/fromEvent"], function (require, exports, Observable_29, fromEvent_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_29.Observable.fromEvent = fromEvent_1.fromEvent;
});
define("node_modules/rxjs/src/observable/FromEventPatternObservable", ["require", "exports", "node_modules/rxjs/src/util/isFunction", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscription"], function (require, exports, isFunction_4, Observable_30, Subscription_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var FromEventPatternObservable = (function (_super) {
        __extends(FromEventPatternObservable, _super);
        function FromEventPatternObservable(addHandler, removeHandler, selector) {
            var _this = _super.call(this) || this;
            _this.addHandler = addHandler;
            _this.removeHandler = removeHandler;
            _this.selector = selector;
            return _this;
        }
        FromEventPatternObservable.create = function (addHandler, removeHandler, selector) {
            return new FromEventPatternObservable(addHandler, removeHandler, selector);
        };
        FromEventPatternObservable.prototype._subscribe = function (subscriber) {
            var _this = this;
            var removeHandler = this.removeHandler;
            var handler = !!this.selector ? function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                _this._callSelector(subscriber, args);
            } : function (e) { subscriber.next(e); };
            var retValue = this._callAddHandler(handler, subscriber);
            if (!isFunction_4.isFunction(removeHandler)) {
                return;
            }
            subscriber.add(new Subscription_8.Subscription(function () {
                removeHandler(handler, retValue);
            }));
        };
        FromEventPatternObservable.prototype._callSelector = function (subscriber, args) {
            try {
                var result = this.selector.apply(this, args);
                subscriber.next(result);
            }
            catch (e) {
                subscriber.error(e);
            }
        };
        FromEventPatternObservable.prototype._callAddHandler = function (handler, errorSubscriber) {
            try {
                return this.addHandler(handler) || null;
            }
            catch (e) {
                errorSubscriber.error(e);
            }
        };
        return FromEventPatternObservable;
    }(Observable_30.Observable));
    exports.FromEventPatternObservable = FromEventPatternObservable;
});
define("node_modules/rxjs/src/observable/fromEventPattern", ["require", "exports", "node_modules/rxjs/src/observable/FromEventPatternObservable"], function (require, exports, FromEventPatternObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fromEventPattern = FromEventPatternObservable_1.FromEventPatternObservable.create;
});
define("node_modules/rxjs/src/add/observable/fromEventPattern", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/fromEventPattern"], function (require, exports, Observable_31, fromEventPattern_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_31.Observable.fromEventPattern = fromEventPattern_1.fromEventPattern;
});
define("node_modules/rxjs/src/observable/fromPromise", ["require", "exports", "node_modules/rxjs/src/observable/PromiseObservable"], function (require, exports, PromiseObservable_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fromPromise = PromiseObservable_2.PromiseObservable.create;
});
define("node_modules/rxjs/src/add/observable/fromPromise", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/fromPromise"], function (require, exports, Observable_32, fromPromise_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_32.Observable.fromPromise = fromPromise_1.fromPromise;
});
define("node_modules/rxjs/src/observable/GenerateObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, Observable_33, isScheduler_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var selfSelector = function (value) { return value; };
    var GenerateObservable = (function (_super) {
        __extends(GenerateObservable, _super);
        function GenerateObservable(initialState, condition, iterate, resultSelector, scheduler) {
            var _this = _super.call(this) || this;
            _this.initialState = initialState;
            _this.condition = condition;
            _this.iterate = iterate;
            _this.resultSelector = resultSelector;
            _this.scheduler = scheduler;
            return _this;
        }
        GenerateObservable.create = function (initialStateOrOptions, condition, iterate, resultSelectorOrObservable, scheduler) {
            if (arguments.length == 1) {
                return new GenerateObservable(initialStateOrOptions.initialState, initialStateOrOptions.condition, initialStateOrOptions.iterate, initialStateOrOptions.resultSelector || selfSelector, initialStateOrOptions.scheduler);
            }
            if (resultSelectorOrObservable === undefined || isScheduler_4.isScheduler(resultSelectorOrObservable)) {
                return new GenerateObservable(initialStateOrOptions, condition, iterate, selfSelector, resultSelectorOrObservable);
            }
            return new GenerateObservable(initialStateOrOptions, condition, iterate, resultSelectorOrObservable, scheduler);
        };
        GenerateObservable.prototype._subscribe = function (subscriber) {
            var state = this.initialState;
            if (this.scheduler) {
                return this.scheduler.schedule(GenerateObservable.dispatch, 0, {
                    subscriber: subscriber,
                    iterate: this.iterate,
                    condition: this.condition,
                    resultSelector: this.resultSelector,
                    state: state
                });
            }
            var _a = this, condition = _a.condition, resultSelector = _a.resultSelector, iterate = _a.iterate;
            do {
                if (condition) {
                    var conditionResult = void 0;
                    try {
                        conditionResult = condition(state);
                    }
                    catch (err) {
                        subscriber.error(err);
                        return;
                    }
                    if (!conditionResult) {
                        subscriber.complete();
                        break;
                    }
                }
                var value = void 0;
                try {
                    value = resultSelector(state);
                }
                catch (err) {
                    subscriber.error(err);
                    return;
                }
                subscriber.next(value);
                if (subscriber.closed) {
                    break;
                }
                try {
                    state = iterate(state);
                }
                catch (err) {
                    subscriber.error(err);
                    return;
                }
            } while (true);
        };
        GenerateObservable.dispatch = function (state) {
            var subscriber = state.subscriber, condition = state.condition;
            if (subscriber.closed) {
                return;
            }
            if (state.needIterate) {
                try {
                    state.state = state.iterate(state.state);
                }
                catch (err) {
                    subscriber.error(err);
                    return;
                }
            }
            else {
                state.needIterate = true;
            }
            if (condition) {
                var conditionResult = void 0;
                try {
                    conditionResult = condition(state.state);
                }
                catch (err) {
                    subscriber.error(err);
                    return;
                }
                if (!conditionResult) {
                    subscriber.complete();
                    return;
                }
                if (subscriber.closed) {
                    return;
                }
            }
            var value;
            try {
                value = state.resultSelector(state.state);
            }
            catch (err) {
                subscriber.error(err);
                return;
            }
            if (subscriber.closed) {
                return;
            }
            subscriber.next(value);
            if (subscriber.closed) {
                return;
            }
            return this.schedule(state);
        };
        return GenerateObservable;
    }(Observable_33.Observable));
    exports.GenerateObservable = GenerateObservable;
});
define("node_modules/rxjs/src/add/observable/generate", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/GenerateObservable"], function (require, exports, Observable_34, GenerateObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_34.Observable.generate = GenerateObservable_1.GenerateObservable.create;
});
define("node_modules/rxjs/src/observable/if", ["require", "exports", "node_modules/rxjs/src/observable/IfObservable"], function (require, exports, IfObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports._if = IfObservable_1.IfObservable.create;
});
define("node_modules/rxjs/src/add/observable/if", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/if"], function (require, exports, Observable_35, if_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_35.Observable.if = if_1._if;
});
define("node_modules/rxjs/src/util/isNumeric", ["require", "exports", "node_modules/rxjs/src/util/isArray"], function (require, exports, isArray_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isNumeric(val) {
        return !isArray_6.isArray(val) && (val - parseFloat(val) + 1) >= 0;
    }
    exports.isNumeric = isNumeric;
    ;
});
define("node_modules/rxjs/src/scheduler/async", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncAction", "node_modules/rxjs/src/scheduler/AsyncScheduler"], function (require, exports, AsyncAction_2, AsyncScheduler_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.async = new AsyncScheduler_2.AsyncScheduler(AsyncAction_2.AsyncAction);
});
define("node_modules/rxjs/src/observable/IntervalObservable", ["require", "exports", "node_modules/rxjs/src/util/isNumeric", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/scheduler/async"], function (require, exports, isNumeric_1, Observable_36, async_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var IntervalObservable = (function (_super) {
        __extends(IntervalObservable, _super);
        function IntervalObservable(period, scheduler) {
            if (period === void 0) { period = 0; }
            if (scheduler === void 0) { scheduler = async_1.async; }
            var _this = _super.call(this) || this;
            _this.period = period;
            _this.scheduler = scheduler;
            if (!isNumeric_1.isNumeric(period) || period < 0) {
                _this.period = 0;
            }
            if (!scheduler || typeof scheduler.schedule !== 'function') {
                _this.scheduler = async_1.async;
            }
            return _this;
        }
        IntervalObservable.create = function (period, scheduler) {
            if (period === void 0) { period = 0; }
            if (scheduler === void 0) { scheduler = async_1.async; }
            return new IntervalObservable(period, scheduler);
        };
        IntervalObservable.dispatch = function (state) {
            var index = state.index, subscriber = state.subscriber, period = state.period;
            subscriber.next(index);
            if (subscriber.closed) {
                return;
            }
            state.index += 1;
            this.schedule(state, period);
        };
        IntervalObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var period = this.period;
            var scheduler = this.scheduler;
            subscriber.add(scheduler.schedule(IntervalObservable.dispatch, period, {
                index: index, subscriber: subscriber, period: period
            }));
        };
        return IntervalObservable;
    }(Observable_36.Observable));
    exports.IntervalObservable = IntervalObservable;
});
define("node_modules/rxjs/src/observable/interval", ["require", "exports", "node_modules/rxjs/src/observable/IntervalObservable"], function (require, exports, IntervalObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.interval = IntervalObservable_1.IntervalObservable.create;
});
define("node_modules/rxjs/src/add/observable/interval", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/interval"], function (require, exports, Observable_37, interval_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_37.Observable.interval = interval_1.interval;
});
define("node_modules/rxjs/src/operator/merge", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/operator/mergeAll", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, Observable_38, ArrayObservable_5, mergeAll_2, isScheduler_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function merge() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        return this.lift.call(mergeStatic.apply(void 0, [this].concat(observables)));
    }
    exports.merge = merge;
    function mergeStatic() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        var concurrent = Number.POSITIVE_INFINITY;
        var scheduler = null;
        var last = observables[observables.length - 1];
        if (isScheduler_5.isScheduler(last)) {
            scheduler = observables.pop();
            if (observables.length > 1 && typeof observables[observables.length - 1] === 'number') {
                concurrent = observables.pop();
            }
        }
        else if (typeof last === 'number') {
            concurrent = observables.pop();
        }
        if (scheduler === null && observables.length === 1 && observables[0] instanceof Observable_38.Observable) {
            return observables[0];
        }
        return new ArrayObservable_5.ArrayObservable(observables, scheduler).lift(new mergeAll_2.MergeAllOperator(concurrent));
    }
    exports.mergeStatic = mergeStatic;
});
define("node_modules/rxjs/src/observable/merge", ["require", "exports", "node_modules/rxjs/src/operator/merge"], function (require, exports, merge_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.merge = merge_1.mergeStatic;
});
define("node_modules/rxjs/src/add/observable/merge", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/merge"], function (require, exports, Observable_39, merge_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_39.Observable.merge = merge_2.merge;
});
define("node_modules/rxjs/src/operator/race", ["require", "exports", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, isArray_7, ArrayObservable_6, OuterSubscriber_6, subscribeToResult_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function race() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        if (observables.length === 1 && isArray_7.isArray(observables[0])) {
            observables = observables[0];
        }
        return this.lift.call(raceStatic.apply(void 0, [this].concat(observables)));
    }
    exports.race = race;
    function raceStatic() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        if (observables.length === 1) {
            if (isArray_7.isArray(observables[0])) {
                observables = observables[0];
            }
            else {
                return observables[0];
            }
        }
        return new ArrayObservable_6.ArrayObservable(observables).lift(new RaceOperator());
    }
    exports.raceStatic = raceStatic;
    var RaceOperator = (function () {
        function RaceOperator() {
        }
        RaceOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new RaceSubscriber(subscriber));
        };
        return RaceOperator;
    }());
    exports.RaceOperator = RaceOperator;
    var RaceSubscriber = (function (_super) {
        __extends(RaceSubscriber, _super);
        function RaceSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.hasFirst = false;
            _this.observables = [];
            _this.subscriptions = [];
            return _this;
        }
        RaceSubscriber.prototype._next = function (observable) {
            this.observables.push(observable);
        };
        RaceSubscriber.prototype._complete = function () {
            var observables = this.observables;
            var len = observables.length;
            if (len === 0) {
                this.destination.complete();
            }
            else {
                for (var i = 0; i < len && !this.hasFirst; i++) {
                    var observable = observables[i];
                    var subscription = subscribeToResult_6.subscribeToResult(this, observable, observable, i);
                    if (this.subscriptions) {
                        this.subscriptions.push(subscription);
                    }
                    this.add(subscription);
                }
                this.observables = null;
            }
        };
        RaceSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            if (!this.hasFirst) {
                this.hasFirst = true;
                for (var i = 0; i < this.subscriptions.length; i++) {
                    if (i !== outerIndex) {
                        var subscription = this.subscriptions[i];
                        subscription.unsubscribe();
                        this.remove(subscription);
                    }
                }
                this.subscriptions = null;
            }
            this.destination.next(innerValue);
        };
        return RaceSubscriber;
    }(OuterSubscriber_6.OuterSubscriber));
    exports.RaceSubscriber = RaceSubscriber;
});
define("node_modules/rxjs/src/add/observable/race", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/race"], function (require, exports, Observable_40, race_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_40.Observable.race = race_1.raceStatic;
});
define("node_modules/rxjs/src/util/noop", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function noop() { }
    exports.noop = noop;
});
define("node_modules/rxjs/src/observable/NeverObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/noop"], function (require, exports, Observable_41, noop_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var NeverObservable = (function (_super) {
        __extends(NeverObservable, _super);
        function NeverObservable() {
            return _super.call(this) || this;
        }
        NeverObservable.create = function () {
            return new NeverObservable();
        };
        NeverObservable.prototype._subscribe = function (subscriber) {
            noop_1.noop();
        };
        return NeverObservable;
    }(Observable_41.Observable));
    exports.NeverObservable = NeverObservable;
});
define("node_modules/rxjs/src/observable/never", ["require", "exports", "node_modules/rxjs/src/observable/NeverObservable"], function (require, exports, NeverObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.never = NeverObservable_1.NeverObservable.create;
});
define("node_modules/rxjs/src/add/observable/never", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/never"], function (require, exports, Observable_42, never_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_42.Observable.never = never_1.never;
});
define("node_modules/rxjs/src/observable/of", ["require", "exports", "node_modules/rxjs/src/observable/ArrayObservable"], function (require, exports, ArrayObservable_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.of = ArrayObservable_7.ArrayObservable.of;
});
define("node_modules/rxjs/src/add/observable/of", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/of"], function (require, exports, Observable_43, of_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_43.Observable.of = of_1.of;
});
define("node_modules/rxjs/src/operator/onErrorResumeNext", ["require", "exports", "node_modules/rxjs/src/observable/FromObservable", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, FromObservable_2, isArray_8, OuterSubscriber_7, subscribeToResult_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function onErrorResumeNext() {
        var nextSources = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            nextSources[_i] = arguments[_i];
        }
        if (nextSources.length === 1 && isArray_8.isArray(nextSources[0])) {
            nextSources = nextSources[0];
        }
        return this.lift(new OnErrorResumeNextOperator(nextSources));
    }
    exports.onErrorResumeNext = onErrorResumeNext;
    function onErrorResumeNextStatic() {
        var nextSources = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            nextSources[_i] = arguments[_i];
        }
        var source = null;
        if (nextSources.length === 1 && isArray_8.isArray(nextSources[0])) {
            nextSources = nextSources[0];
        }
        source = nextSources.shift();
        return new FromObservable_2.FromObservable(source, null).lift(new OnErrorResumeNextOperator(nextSources));
    }
    exports.onErrorResumeNextStatic = onErrorResumeNextStatic;
    var OnErrorResumeNextOperator = (function () {
        function OnErrorResumeNextOperator(nextSources) {
            this.nextSources = nextSources;
        }
        OnErrorResumeNextOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new OnErrorResumeNextSubscriber(subscriber, this.nextSources));
        };
        return OnErrorResumeNextOperator;
    }());
    var OnErrorResumeNextSubscriber = (function (_super) {
        __extends(OnErrorResumeNextSubscriber, _super);
        function OnErrorResumeNextSubscriber(destination, nextSources) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            _this.nextSources = nextSources;
            return _this;
        }
        OnErrorResumeNextSubscriber.prototype.notifyError = function (error, innerSub) {
            this.subscribeToNextSource();
        };
        OnErrorResumeNextSubscriber.prototype.notifyComplete = function (innerSub) {
            this.subscribeToNextSource();
        };
        OnErrorResumeNextSubscriber.prototype._error = function (err) {
            this.subscribeToNextSource();
        };
        OnErrorResumeNextSubscriber.prototype._complete = function () {
            this.subscribeToNextSource();
        };
        OnErrorResumeNextSubscriber.prototype.subscribeToNextSource = function () {
            var next = this.nextSources.shift();
            if (next) {
                this.add(subscribeToResult_7.subscribeToResult(this, next));
            }
            else {
                this.destination.complete();
            }
        };
        return OnErrorResumeNextSubscriber;
    }(OuterSubscriber_7.OuterSubscriber));
});
define("node_modules/rxjs/src/add/observable/onErrorResumeNext", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/onErrorResumeNext"], function (require, exports, Observable_44, onErrorResumeNext_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_44.Observable.onErrorResumeNext = onErrorResumeNext_1.onErrorResumeNextStatic;
});
define("node_modules/rxjs/src/observable/PairsObservable", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_45) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function dispatch(state) {
        var obj = state.obj, keys = state.keys, length = state.length, index = state.index, subscriber = state.subscriber;
        if (index === length) {
            subscriber.complete();
            return;
        }
        var key = keys[index];
        subscriber.next([key, obj[key]]);
        state.index = index + 1;
        this.schedule(state);
    }
    var PairsObservable = (function (_super) {
        __extends(PairsObservable, _super);
        function PairsObservable(obj, scheduler) {
            var _this = _super.call(this) || this;
            _this.obj = obj;
            _this.scheduler = scheduler;
            _this.keys = Object.keys(obj);
            return _this;
        }
        PairsObservable.create = function (obj, scheduler) {
            return new PairsObservable(obj, scheduler);
        };
        PairsObservable.prototype._subscribe = function (subscriber) {
            var _a = this, keys = _a.keys, scheduler = _a.scheduler;
            var length = keys.length;
            if (scheduler) {
                return scheduler.schedule(dispatch, 0, {
                    obj: this.obj, keys: keys, length: length, index: 0, subscriber: subscriber
                });
            }
            else {
                for (var idx = 0; idx < length; idx++) {
                    var key = keys[idx];
                    subscriber.next([key, this.obj[key]]);
                }
                subscriber.complete();
            }
        };
        return PairsObservable;
    }(Observable_45.Observable));
    exports.PairsObservable = PairsObservable;
});
define("node_modules/rxjs/src/observable/pairs", ["require", "exports", "node_modules/rxjs/src/observable/PairsObservable"], function (require, exports, PairsObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.pairs = PairsObservable_1.PairsObservable.create;
});
define("node_modules/rxjs/src/add/observable/pairs", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/pairs"], function (require, exports, Observable_46, pairs_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_46.Observable.pairs = pairs_1.pairs;
});
define("node_modules/rxjs/src/observable/RangeObservable", ["require", "exports", "node_modules/rxjs/src/Observable"], function (require, exports, Observable_47) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var RangeObservable = (function (_super) {
        __extends(RangeObservable, _super);
        function RangeObservable(start, count, scheduler) {
            var _this = _super.call(this) || this;
            _this.start = start;
            _this._count = count;
            _this.scheduler = scheduler;
            return _this;
        }
        RangeObservable.create = function (start, count, scheduler) {
            if (start === void 0) { start = 0; }
            if (count === void 0) { count = 0; }
            return new RangeObservable(start, count, scheduler);
        };
        RangeObservable.dispatch = function (state) {
            var start = state.start, index = state.index, count = state.count, subscriber = state.subscriber;
            if (index >= count) {
                subscriber.complete();
                return;
            }
            subscriber.next(start);
            if (subscriber.closed) {
                return;
            }
            state.index = index + 1;
            state.start = start + 1;
            this.schedule(state);
        };
        RangeObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var start = this.start;
            var count = this._count;
            var scheduler = this.scheduler;
            if (scheduler) {
                return scheduler.schedule(RangeObservable.dispatch, 0, {
                    index: index, count: count, start: start, subscriber: subscriber
                });
            }
            else {
                do {
                    if (index++ >= count) {
                        subscriber.complete();
                        break;
                    }
                    subscriber.next(start++);
                    if (subscriber.closed) {
                        break;
                    }
                } while (true);
            }
        };
        return RangeObservable;
    }(Observable_47.Observable));
    exports.RangeObservable = RangeObservable;
});
define("node_modules/rxjs/src/observable/range", ["require", "exports", "node_modules/rxjs/src/observable/RangeObservable"], function (require, exports, RangeObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.range = RangeObservable_1.RangeObservable.create;
});
define("node_modules/rxjs/src/add/observable/range", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/range"], function (require, exports, Observable_48, range_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_48.Observable.range = range_1.range;
});
define("node_modules/rxjs/src/observable/UsingObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, Observable_49, subscribeToResult_8, OuterSubscriber_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var UsingObservable = (function (_super) {
        __extends(UsingObservable, _super);
        function UsingObservable(resourceFactory, observableFactory) {
            var _this = _super.call(this) || this;
            _this.resourceFactory = resourceFactory;
            _this.observableFactory = observableFactory;
            return _this;
        }
        UsingObservable.create = function (resourceFactory, observableFactory) {
            return new UsingObservable(resourceFactory, observableFactory);
        };
        UsingObservable.prototype._subscribe = function (subscriber) {
            var _a = this, resourceFactory = _a.resourceFactory, observableFactory = _a.observableFactory;
            var resource;
            try {
                resource = resourceFactory();
                return new UsingSubscriber(subscriber, resource, observableFactory);
            }
            catch (err) {
                subscriber.error(err);
            }
        };
        return UsingObservable;
    }(Observable_49.Observable));
    exports.UsingObservable = UsingObservable;
    var UsingSubscriber = (function (_super) {
        __extends(UsingSubscriber, _super);
        function UsingSubscriber(destination, resource, observableFactory) {
            var _this = _super.call(this, destination) || this;
            _this.resource = resource;
            _this.observableFactory = observableFactory;
            destination.add(resource);
            _this.tryUse();
            return _this;
        }
        UsingSubscriber.prototype.tryUse = function () {
            try {
                var source = this.observableFactory.call(this, this.resource);
                if (source) {
                    this.add(subscribeToResult_8.subscribeToResult(this, source));
                }
            }
            catch (err) {
                this._error(err);
            }
        };
        return UsingSubscriber;
    }(OuterSubscriber_8.OuterSubscriber));
});
define("node_modules/rxjs/src/observable/using", ["require", "exports", "node_modules/rxjs/src/observable/UsingObservable"], function (require, exports, UsingObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.using = UsingObservable_1.UsingObservable.create;
});
define("node_modules/rxjs/src/add/observable/using", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/using"], function (require, exports, Observable_50, using_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_50.Observable.using = using_1.using;
});
define("node_modules/rxjs/src/observable/throw", ["require", "exports", "node_modules/rxjs/src/observable/ErrorObservable"], function (require, exports, ErrorObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports._throw = ErrorObservable_1.ErrorObservable.create;
});
define("node_modules/rxjs/src/add/observable/throw", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/throw"], function (require, exports, Observable_51, throw_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_51.Observable.throw = throw_1._throw;
});
define("node_modules/rxjs/src/util/isDate", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isDate(value) {
        return value instanceof Date && !isNaN(+value);
    }
    exports.isDate = isDate;
});
define("node_modules/rxjs/src/observable/TimerObservable", ["require", "exports", "node_modules/rxjs/src/util/isNumeric", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/util/isScheduler", "node_modules/rxjs/src/util/isDate"], function (require, exports, isNumeric_2, Observable_52, async_2, isScheduler_6, isDate_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var TimerObservable = (function (_super) {
        __extends(TimerObservable, _super);
        function TimerObservable(dueTime, period, scheduler) {
            if (dueTime === void 0) { dueTime = 0; }
            var _this = _super.call(this) || this;
            _this.period = -1;
            _this.dueTime = 0;
            if (isNumeric_2.isNumeric(period)) {
                _this.period = Number(period) < 1 && 1 || Number(period);
            }
            else if (isScheduler_6.isScheduler(period)) {
                scheduler = period;
            }
            if (!isScheduler_6.isScheduler(scheduler)) {
                scheduler = async_2.async;
            }
            _this.scheduler = scheduler;
            _this.dueTime = isDate_1.isDate(dueTime) ?
                (+dueTime - _this.scheduler.now()) :
                dueTime;
            return _this;
        }
        TimerObservable.create = function (initialDelay, period, scheduler) {
            if (initialDelay === void 0) { initialDelay = 0; }
            return new TimerObservable(initialDelay, period, scheduler);
        };
        TimerObservable.dispatch = function (state) {
            var index = state.index, period = state.period, subscriber = state.subscriber;
            var action = this;
            subscriber.next(index);
            if (subscriber.closed) {
                return;
            }
            else if (period === -1) {
                return subscriber.complete();
            }
            state.index = index + 1;
            action.schedule(state, period);
        };
        TimerObservable.prototype._subscribe = function (subscriber) {
            var index = 0;
            var _a = this, period = _a.period, dueTime = _a.dueTime, scheduler = _a.scheduler;
            return scheduler.schedule(TimerObservable.dispatch, dueTime, {
                index: index, period: period, subscriber: subscriber
            });
        };
        return TimerObservable;
    }(Observable_52.Observable));
    exports.TimerObservable = TimerObservable;
});
define("node_modules/rxjs/src/observable/timer", ["require", "exports", "node_modules/rxjs/src/observable/TimerObservable"], function (require, exports, TimerObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.timer = TimerObservable_1.TimerObservable.create;
});
define("node_modules/rxjs/src/add/observable/timer", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/timer"], function (require, exports, Observable_53, timer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_53.Observable.timer = timer_1.timer;
});
define("node_modules/rxjs/src/operator/zip", ["require", "exports", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/util/isArray", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/symbol/iterator"], function (require, exports, ArrayObservable_8, isArray_9, Subscriber_8, OuterSubscriber_9, subscribeToResult_9, iterator_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function zipProto() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        return this.lift.call(zipStatic.apply(void 0, [this].concat(observables)));
    }
    exports.zipProto = zipProto;
    function zipStatic() {
        var observables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            observables[_i] = arguments[_i];
        }
        var project = observables[observables.length - 1];
        if (typeof project === 'function') {
            observables.pop();
        }
        return new ArrayObservable_8.ArrayObservable(observables).lift(new ZipOperator(project));
    }
    exports.zipStatic = zipStatic;
    var ZipOperator = (function () {
        function ZipOperator(project) {
            this.project = project;
        }
        ZipOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ZipSubscriber(subscriber, this.project));
        };
        return ZipOperator;
    }());
    exports.ZipOperator = ZipOperator;
    var ZipSubscriber = (function (_super) {
        __extends(ZipSubscriber, _super);
        function ZipSubscriber(destination, project, values) {
            if (values === void 0) { values = Object.create(null); }
            var _this = _super.call(this, destination) || this;
            _this.iterators = [];
            _this.active = 0;
            _this.project = (typeof project === 'function') ? project : null;
            _this.values = values;
            return _this;
        }
        ZipSubscriber.prototype._next = function (value) {
            var iterators = this.iterators;
            if (isArray_9.isArray(value)) {
                iterators.push(new StaticArrayIterator(value));
            }
            else if (typeof value[iterator_4.iterator] === 'function') {
                iterators.push(new StaticIterator(value[iterator_4.iterator]()));
            }
            else {
                iterators.push(new ZipBufferIterator(this.destination, this, value));
            }
        };
        ZipSubscriber.prototype._complete = function () {
            var iterators = this.iterators;
            var len = iterators.length;
            if (len === 0) {
                this.destination.complete();
                return;
            }
            this.active = len;
            for (var i = 0; i < len; i++) {
                var iterator = iterators[i];
                if (iterator.stillUnsubscribed) {
                    this.add(iterator.subscribe(iterator, i));
                }
                else {
                    this.active--;
                }
            }
        };
        ZipSubscriber.prototype.notifyInactive = function () {
            this.active--;
            if (this.active === 0) {
                this.destination.complete();
            }
        };
        ZipSubscriber.prototype.checkIterators = function () {
            var iterators = this.iterators;
            var len = iterators.length;
            var destination = this.destination;
            for (var i = 0; i < len; i++) {
                var iterator = iterators[i];
                if (typeof iterator.hasValue === 'function' && !iterator.hasValue()) {
                    return;
                }
            }
            var shouldComplete = false;
            var args = [];
            for (var i = 0; i < len; i++) {
                var iterator = iterators[i];
                var result = iterator.next();
                if (iterator.hasCompleted()) {
                    shouldComplete = true;
                }
                if (result.done) {
                    destination.complete();
                    return;
                }
                args.push(result.value);
            }
            if (this.project) {
                this._tryProject(args);
            }
            else {
                destination.next(args);
            }
            if (shouldComplete) {
                destination.complete();
            }
        };
        ZipSubscriber.prototype._tryProject = function (args) {
            var result;
            try {
                result = this.project.apply(this, args);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        return ZipSubscriber;
    }(Subscriber_8.Subscriber));
    exports.ZipSubscriber = ZipSubscriber;
    var StaticIterator = (function () {
        function StaticIterator(iterator) {
            this.iterator = iterator;
            this.nextResult = iterator.next();
        }
        StaticIterator.prototype.hasValue = function () {
            return true;
        };
        StaticIterator.prototype.next = function () {
            var result = this.nextResult;
            this.nextResult = this.iterator.next();
            return result;
        };
        StaticIterator.prototype.hasCompleted = function () {
            var nextResult = this.nextResult;
            return nextResult && nextResult.done;
        };
        return StaticIterator;
    }());
    var StaticArrayIterator = (function () {
        function StaticArrayIterator(array) {
            this.array = array;
            this.index = 0;
            this.length = 0;
            this.length = array.length;
        }
        StaticArrayIterator.prototype[iterator_4.iterator] = function () {
            return this;
        };
        StaticArrayIterator.prototype.next = function (value) {
            var i = this.index++;
            var array = this.array;
            return i < this.length ? { value: array[i], done: false } : { value: null, done: true };
        };
        StaticArrayIterator.prototype.hasValue = function () {
            return this.array.length > this.index;
        };
        StaticArrayIterator.prototype.hasCompleted = function () {
            return this.array.length === this.index;
        };
        return StaticArrayIterator;
    }());
    var ZipBufferIterator = (function (_super) {
        __extends(ZipBufferIterator, _super);
        function ZipBufferIterator(destination, parent, observable) {
            var _this = _super.call(this, destination) || this;
            _this.parent = parent;
            _this.observable = observable;
            _this.stillUnsubscribed = true;
            _this.buffer = [];
            _this.isComplete = false;
            return _this;
        }
        ZipBufferIterator.prototype[iterator_4.iterator] = function () {
            return this;
        };
        ZipBufferIterator.prototype.next = function () {
            var buffer = this.buffer;
            if (buffer.length === 0 && this.isComplete) {
                return { value: null, done: true };
            }
            else {
                return { value: buffer.shift(), done: false };
            }
        };
        ZipBufferIterator.prototype.hasValue = function () {
            return this.buffer.length > 0;
        };
        ZipBufferIterator.prototype.hasCompleted = function () {
            return this.buffer.length === 0 && this.isComplete;
        };
        ZipBufferIterator.prototype.notifyComplete = function () {
            if (this.buffer.length > 0) {
                this.isComplete = true;
                this.parent.notifyInactive();
            }
            else {
                this.destination.complete();
            }
        };
        ZipBufferIterator.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.buffer.push(innerValue);
            this.parent.checkIterators();
        };
        ZipBufferIterator.prototype.subscribe = function (value, index) {
            return subscribeToResult_9.subscribeToResult(this, this.observable, this, index);
        };
        return ZipBufferIterator;
    }(OuterSubscriber_9.OuterSubscriber));
});
define("node_modules/rxjs/src/observable/zip", ["require", "exports", "node_modules/rxjs/src/operator/zip"], function (require, exports, zip_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.zip = zip_1.zipStatic;
});
define("node_modules/rxjs/src/add/observable/zip", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/zip"], function (require, exports, Observable_54, zip_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_54.Observable.zip = zip_2.zip;
});
define("node_modules/rxjs/src/observable/dom/ajax", ["require", "exports", "node_modules/rxjs/src/observable/dom/AjaxObservable"], function (require, exports, AjaxObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ajax = AjaxObservable_1.AjaxObservable.create;
});
define("node_modules/rxjs/src/add/observable/dom/ajax", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/dom/ajax"], function (require, exports, Observable_55, ajax_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_55.Observable.ajax = ajax_1.ajax;
});
define("node_modules/rxjs/src/util/assign", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_10) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function assignImpl(target) {
        var sources = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            sources[_i - 1] = arguments[_i];
        }
        var len = sources.length;
        for (var i = 0; i < len; i++) {
            var source = sources[i];
            for (var k_1 in source) {
                if (source.hasOwnProperty(k_1)) {
                    target[k_1] = source[k_1];
                }
            }
        }
        return target;
    }
    exports.assignImpl = assignImpl;
    ;
    function getAssign(root) {
        return root.Object.assign || assignImpl;
    }
    exports.getAssign = getAssign;
    exports.assign = getAssign(root_10.root);
});
define("node_modules/rxjs/src/observable/dom/WebSocketSubject", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/ReplaySubject", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/util/assign"], function (require, exports, Subject_4, Subscriber_9, Observable_56, Subscription_9, root_11, ReplaySubject_1, tryCatch_6, errorObject_7, assign_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var WebSocketSubject = (function (_super) {
        __extends(WebSocketSubject, _super);
        function WebSocketSubject(urlConfigOrSource, destination) {
            var _this = this;
            if (urlConfigOrSource instanceof Observable_56.Observable) {
                _this = _super.call(this, destination, urlConfigOrSource) || this;
            }
            else {
                _this = _super.call(this) || this;
                _this.WebSocketCtor = root_11.root.WebSocket;
                _this._output = new Subject_4.Subject();
                if (typeof urlConfigOrSource === 'string') {
                    _this.url = urlConfigOrSource;
                }
                else {
                    assign_1.assign(_this, urlConfigOrSource);
                }
                if (!_this.WebSocketCtor) {
                    throw new Error('no WebSocket constructor can be found');
                }
                _this.destination = new ReplaySubject_1.ReplaySubject();
            }
            return _this;
        }
        WebSocketSubject.prototype.resultSelector = function (e) {
            return JSON.parse(e.data);
        };
        WebSocketSubject.create = function (urlConfigOrSource) {
            return new WebSocketSubject(urlConfigOrSource);
        };
        WebSocketSubject.prototype.lift = function (operator) {
            var sock = new WebSocketSubject(this, this.destination);
            sock.operator = operator;
            return sock;
        };
        WebSocketSubject.prototype._resetState = function () {
            this.socket = null;
            if (!this.source) {
                this.destination = new ReplaySubject_1.ReplaySubject();
            }
            this._output = new Subject_4.Subject();
        };
        WebSocketSubject.prototype.multiplex = function (subMsg, unsubMsg, messageFilter) {
            var self = this;
            return new Observable_56.Observable(function (observer) {
                var result = tryCatch_6.tryCatch(subMsg)();
                if (result === errorObject_7.errorObject) {
                    observer.error(errorObject_7.errorObject.e);
                }
                else {
                    self.next(result);
                }
                var subscription = self.subscribe(function (x) {
                    var result = tryCatch_6.tryCatch(messageFilter)(x);
                    if (result === errorObject_7.errorObject) {
                        observer.error(errorObject_7.errorObject.e);
                    }
                    else if (result) {
                        observer.next(x);
                    }
                }, function (err) { return observer.error(err); }, function () { return observer.complete(); });
                return function () {
                    var result = tryCatch_6.tryCatch(unsubMsg)();
                    if (result === errorObject_7.errorObject) {
                        observer.error(errorObject_7.errorObject.e);
                    }
                    else {
                        self.next(result);
                    }
                    subscription.unsubscribe();
                };
            });
        };
        WebSocketSubject.prototype._connectSocket = function () {
            var _this = this;
            var WebSocketCtor = this.WebSocketCtor;
            var observer = this._output;
            var socket = null;
            try {
                socket = this.protocol ?
                    new WebSocketCtor(this.url, this.protocol) :
                    new WebSocketCtor(this.url);
                this.socket = socket;
                if (this.binaryType) {
                    this.socket.binaryType = this.binaryType;
                }
            }
            catch (e) {
                observer.error(e);
                return;
            }
            var subscription = new Subscription_9.Subscription(function () {
                _this.socket = null;
                if (socket && socket.readyState === 1) {
                    socket.close();
                }
            });
            socket.onopen = function (e) {
                var openObserver = _this.openObserver;
                if (openObserver) {
                    openObserver.next(e);
                }
                var queue = _this.destination;
                _this.destination = Subscriber_9.Subscriber.create(function (x) { return socket.readyState === 1 && socket.send(x); }, function (e) {
                    var closingObserver = _this.closingObserver;
                    if (closingObserver) {
                        closingObserver.next(undefined);
                    }
                    if (e && e.code) {
                        socket.close(e.code, e.reason);
                    }
                    else {
                        observer.error(new TypeError('WebSocketSubject.error must be called with an object with an error code, ' +
                            'and an optional reason: { code: number, reason: string }'));
                    }
                    _this._resetState();
                }, function () {
                    var closingObserver = _this.closingObserver;
                    if (closingObserver) {
                        closingObserver.next(undefined);
                    }
                    socket.close();
                    _this._resetState();
                });
                if (queue && queue instanceof ReplaySubject_1.ReplaySubject) {
                    subscription.add(queue.subscribe(_this.destination));
                }
            };
            socket.onerror = function (e) {
                _this._resetState();
                observer.error(e);
            };
            socket.onclose = function (e) {
                _this._resetState();
                var closeObserver = _this.closeObserver;
                if (closeObserver) {
                    closeObserver.next(e);
                }
                if (e.wasClean) {
                    observer.complete();
                }
                else {
                    observer.error(e);
                }
            };
            socket.onmessage = function (e) {
                var result = tryCatch_6.tryCatch(_this.resultSelector)(e);
                if (result === errorObject_7.errorObject) {
                    observer.error(errorObject_7.errorObject.e);
                }
                else {
                    observer.next(result);
                }
            };
        };
        WebSocketSubject.prototype._subscribe = function (subscriber) {
            var _this = this;
            var source = this.source;
            if (source) {
                return source.subscribe(subscriber);
            }
            if (!this.socket) {
                this._connectSocket();
            }
            var subscription = new Subscription_9.Subscription();
            subscription.add(this._output.subscribe(subscriber));
            subscription.add(function () {
                var socket = _this.socket;
                if (_this._output.observers.length === 0) {
                    if (socket && socket.readyState === 1) {
                        socket.close();
                    }
                    _this._resetState();
                }
            });
            return subscription;
        };
        WebSocketSubject.prototype.unsubscribe = function () {
            var _a = this, source = _a.source, socket = _a.socket;
            if (socket && socket.readyState === 1) {
                socket.close();
                this._resetState();
            }
            _super.prototype.unsubscribe.call(this);
            if (!source) {
                this.destination = new ReplaySubject_1.ReplaySubject();
            }
        };
        return WebSocketSubject;
    }(Subject_4.AnonymousSubject));
    exports.WebSocketSubject = WebSocketSubject;
});
define("node_modules/rxjs/src/observable/dom/webSocket", ["require", "exports", "node_modules/rxjs/src/observable/dom/WebSocketSubject"], function (require, exports, WebSocketSubject_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.webSocket = WebSocketSubject_1.WebSocketSubject.create;
});
define("node_modules/rxjs/src/add/observable/dom/webSocket", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/observable/dom/webSocket"], function (require, exports, Observable_57, webSocket_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_57.Observable.webSocket = webSocket_1.webSocket;
});
define("node_modules/rxjs/src/operator/buffer", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_10, subscribeToResult_10) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function buffer(closingNotifier) {
        return this.lift(new BufferOperator(closingNotifier));
    }
    exports.buffer = buffer;
    var BufferOperator = (function () {
        function BufferOperator(closingNotifier) {
            this.closingNotifier = closingNotifier;
        }
        BufferOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new BufferSubscriber(subscriber, this.closingNotifier));
        };
        return BufferOperator;
    }());
    var BufferSubscriber = (function (_super) {
        __extends(BufferSubscriber, _super);
        function BufferSubscriber(destination, closingNotifier) {
            var _this = _super.call(this, destination) || this;
            _this.buffer = [];
            _this.add(subscribeToResult_10.subscribeToResult(_this, closingNotifier));
            return _this;
        }
        BufferSubscriber.prototype._next = function (value) {
            this.buffer.push(value);
        };
        BufferSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var buffer = this.buffer;
            this.buffer = [];
            this.destination.next(buffer);
        };
        return BufferSubscriber;
    }(OuterSubscriber_10.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/buffer", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/buffer"], function (require, exports, Observable_58, buffer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_58.Observable.prototype.buffer = buffer_1.buffer;
});
define("node_modules/rxjs/src/operator/bufferCount", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_10) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function bufferCount(bufferSize, startBufferEvery) {
        if (startBufferEvery === void 0) { startBufferEvery = null; }
        return this.lift(new BufferCountOperator(bufferSize, startBufferEvery));
    }
    exports.bufferCount = bufferCount;
    var BufferCountOperator = (function () {
        function BufferCountOperator(bufferSize, startBufferEvery) {
            this.bufferSize = bufferSize;
            this.startBufferEvery = startBufferEvery;
            if (!startBufferEvery || bufferSize === startBufferEvery) {
                this.subscriberClass = BufferCountSubscriber;
            }
            else {
                this.subscriberClass = BufferSkipCountSubscriber;
            }
        }
        BufferCountOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new this.subscriberClass(subscriber, this.bufferSize, this.startBufferEvery));
        };
        return BufferCountOperator;
    }());
    var BufferCountSubscriber = (function (_super) {
        __extends(BufferCountSubscriber, _super);
        function BufferCountSubscriber(destination, bufferSize) {
            var _this = _super.call(this, destination) || this;
            _this.bufferSize = bufferSize;
            _this.buffer = [];
            return _this;
        }
        BufferCountSubscriber.prototype._next = function (value) {
            var buffer = this.buffer;
            buffer.push(value);
            if (buffer.length == this.bufferSize) {
                this.destination.next(buffer);
                this.buffer = [];
            }
        };
        BufferCountSubscriber.prototype._complete = function () {
            var buffer = this.buffer;
            if (buffer.length > 0) {
                this.destination.next(buffer);
            }
            _super.prototype._complete.call(this);
        };
        return BufferCountSubscriber;
    }(Subscriber_10.Subscriber));
    var BufferSkipCountSubscriber = (function (_super) {
        __extends(BufferSkipCountSubscriber, _super);
        function BufferSkipCountSubscriber(destination, bufferSize, startBufferEvery) {
            var _this = _super.call(this, destination) || this;
            _this.bufferSize = bufferSize;
            _this.startBufferEvery = startBufferEvery;
            _this.buffers = [];
            _this.count = 0;
            return _this;
        }
        BufferSkipCountSubscriber.prototype._next = function (value) {
            var _a = this, bufferSize = _a.bufferSize, startBufferEvery = _a.startBufferEvery, buffers = _a.buffers, count = _a.count;
            this.count++;
            if (count % startBufferEvery === 0) {
                buffers.push([]);
            }
            for (var i = buffers.length; i--;) {
                var buffer = buffers[i];
                buffer.push(value);
                if (buffer.length === bufferSize) {
                    buffers.splice(i, 1);
                    this.destination.next(buffer);
                }
            }
        };
        BufferSkipCountSubscriber.prototype._complete = function () {
            var _a = this, buffers = _a.buffers, destination = _a.destination;
            while (buffers.length > 0) {
                var buffer = buffers.shift();
                if (buffer.length > 0) {
                    destination.next(buffer);
                }
            }
            _super.prototype._complete.call(this);
        };
        return BufferSkipCountSubscriber;
    }(Subscriber_10.Subscriber));
});
define("node_modules/rxjs/src/add/operator/bufferCount", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/bufferCount"], function (require, exports, Observable_59, bufferCount_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_59.Observable.prototype.bufferCount = bufferCount_1.bufferCount;
});
define("node_modules/rxjs/src/operator/bufferTime", ["require", "exports", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, async_3, Subscriber_11, isScheduler_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function bufferTime(bufferTimeSpan) {
        var length = arguments.length;
        var scheduler = async_3.async;
        if (isScheduler_7.isScheduler(arguments[arguments.length - 1])) {
            scheduler = arguments[arguments.length - 1];
            length--;
        }
        var bufferCreationInterval = null;
        if (length >= 2) {
            bufferCreationInterval = arguments[1];
        }
        var maxBufferSize = Number.POSITIVE_INFINITY;
        if (length >= 3) {
            maxBufferSize = arguments[2];
        }
        return this.lift(new BufferTimeOperator(bufferTimeSpan, bufferCreationInterval, maxBufferSize, scheduler));
    }
    exports.bufferTime = bufferTime;
    var BufferTimeOperator = (function () {
        function BufferTimeOperator(bufferTimeSpan, bufferCreationInterval, maxBufferSize, scheduler) {
            this.bufferTimeSpan = bufferTimeSpan;
            this.bufferCreationInterval = bufferCreationInterval;
            this.maxBufferSize = maxBufferSize;
            this.scheduler = scheduler;
        }
        BufferTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new BufferTimeSubscriber(subscriber, this.bufferTimeSpan, this.bufferCreationInterval, this.maxBufferSize, this.scheduler));
        };
        return BufferTimeOperator;
    }());
    var Context = (function () {
        function Context() {
            this.buffer = [];
        }
        return Context;
    }());
    var BufferTimeSubscriber = (function (_super) {
        __extends(BufferTimeSubscriber, _super);
        function BufferTimeSubscriber(destination, bufferTimeSpan, bufferCreationInterval, maxBufferSize, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.bufferTimeSpan = bufferTimeSpan;
            _this.bufferCreationInterval = bufferCreationInterval;
            _this.maxBufferSize = maxBufferSize;
            _this.scheduler = scheduler;
            _this.contexts = [];
            var context = _this.openContext();
            _this.timespanOnly = bufferCreationInterval == null || bufferCreationInterval < 0;
            if (_this.timespanOnly) {
                var timeSpanOnlyState = { subscriber: _this, context: context, bufferTimeSpan: bufferTimeSpan };
                _this.add(context.closeAction = scheduler.schedule(dispatchBufferTimeSpanOnly, bufferTimeSpan, timeSpanOnlyState));
            }
            else {
                var closeState = { subscriber: _this, context: context };
                var creationState = { bufferTimeSpan: bufferTimeSpan, bufferCreationInterval: bufferCreationInterval, subscriber: _this, scheduler: scheduler };
                _this.add(context.closeAction = scheduler.schedule(dispatchBufferClose, bufferTimeSpan, closeState));
                _this.add(scheduler.schedule(dispatchBufferCreation, bufferCreationInterval, creationState));
            }
            return _this;
        }
        BufferTimeSubscriber.prototype._next = function (value) {
            var contexts = this.contexts;
            var len = contexts.length;
            var filledBufferContext;
            for (var i = 0; i < len; i++) {
                var context = contexts[i];
                var buffer = context.buffer;
                buffer.push(value);
                if (buffer.length == this.maxBufferSize) {
                    filledBufferContext = context;
                }
            }
            if (filledBufferContext) {
                this.onBufferFull(filledBufferContext);
            }
        };
        BufferTimeSubscriber.prototype._error = function (err) {
            this.contexts.length = 0;
            _super.prototype._error.call(this, err);
        };
        BufferTimeSubscriber.prototype._complete = function () {
            var _a = this, contexts = _a.contexts, destination = _a.destination;
            while (contexts.length > 0) {
                var context = contexts.shift();
                destination.next(context.buffer);
            }
            _super.prototype._complete.call(this);
        };
        BufferTimeSubscriber.prototype._unsubscribe = function () {
            this.contexts = null;
        };
        BufferTimeSubscriber.prototype.onBufferFull = function (context) {
            this.closeContext(context);
            var closeAction = context.closeAction;
            closeAction.unsubscribe();
            this.remove(closeAction);
            if (!this.closed && this.timespanOnly) {
                context = this.openContext();
                var bufferTimeSpan = this.bufferTimeSpan;
                var timeSpanOnlyState = { subscriber: this, context: context, bufferTimeSpan: bufferTimeSpan };
                this.add(context.closeAction = this.scheduler.schedule(dispatchBufferTimeSpanOnly, bufferTimeSpan, timeSpanOnlyState));
            }
        };
        BufferTimeSubscriber.prototype.openContext = function () {
            var context = new Context();
            this.contexts.push(context);
            return context;
        };
        BufferTimeSubscriber.prototype.closeContext = function (context) {
            this.destination.next(context.buffer);
            var contexts = this.contexts;
            var spliceIndex = contexts ? contexts.indexOf(context) : -1;
            if (spliceIndex >= 0) {
                contexts.splice(contexts.indexOf(context), 1);
            }
        };
        return BufferTimeSubscriber;
    }(Subscriber_11.Subscriber));
    function dispatchBufferTimeSpanOnly(state) {
        var subscriber = state.subscriber;
        var prevContext = state.context;
        if (prevContext) {
            subscriber.closeContext(prevContext);
        }
        if (!subscriber.closed) {
            state.context = subscriber.openContext();
            state.context.closeAction = this.schedule(state, state.bufferTimeSpan);
        }
    }
    function dispatchBufferCreation(state) {
        var bufferCreationInterval = state.bufferCreationInterval, bufferTimeSpan = state.bufferTimeSpan, subscriber = state.subscriber, scheduler = state.scheduler;
        var context = subscriber.openContext();
        var action = this;
        if (!subscriber.closed) {
            subscriber.add(context.closeAction = scheduler.schedule(dispatchBufferClose, bufferTimeSpan, { subscriber: subscriber, context: context }));
            action.schedule(state, bufferCreationInterval);
        }
    }
    function dispatchBufferClose(arg) {
        var subscriber = arg.subscriber, context = arg.context;
        subscriber.closeContext(context);
    }
});
define("node_modules/rxjs/src/add/operator/bufferTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/bufferTime"], function (require, exports, Observable_60, bufferTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_60.Observable.prototype.bufferTime = bufferTime_1.bufferTime;
});
define("node_modules/rxjs/src/operator/bufferToggle", ["require", "exports", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, Subscription_10, subscribeToResult_11, OuterSubscriber_11) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function bufferToggle(openings, closingSelector) {
        return this.lift(new BufferToggleOperator(openings, closingSelector));
    }
    exports.bufferToggle = bufferToggle;
    var BufferToggleOperator = (function () {
        function BufferToggleOperator(openings, closingSelector) {
            this.openings = openings;
            this.closingSelector = closingSelector;
        }
        BufferToggleOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new BufferToggleSubscriber(subscriber, this.openings, this.closingSelector));
        };
        return BufferToggleOperator;
    }());
    var BufferToggleSubscriber = (function (_super) {
        __extends(BufferToggleSubscriber, _super);
        function BufferToggleSubscriber(destination, openings, closingSelector) {
            var _this = _super.call(this, destination) || this;
            _this.openings = openings;
            _this.closingSelector = closingSelector;
            _this.contexts = [];
            _this.add(subscribeToResult_11.subscribeToResult(_this, openings));
            return _this;
        }
        BufferToggleSubscriber.prototype._next = function (value) {
            var contexts = this.contexts;
            var len = contexts.length;
            for (var i = 0; i < len; i++) {
                contexts[i].buffer.push(value);
            }
        };
        BufferToggleSubscriber.prototype._error = function (err) {
            var contexts = this.contexts;
            while (contexts.length > 0) {
                var context = contexts.shift();
                context.subscription.unsubscribe();
                context.buffer = null;
                context.subscription = null;
            }
            this.contexts = null;
            _super.prototype._error.call(this, err);
        };
        BufferToggleSubscriber.prototype._complete = function () {
            var contexts = this.contexts;
            while (contexts.length > 0) {
                var context = contexts.shift();
                this.destination.next(context.buffer);
                context.subscription.unsubscribe();
                context.buffer = null;
                context.subscription = null;
            }
            this.contexts = null;
            _super.prototype._complete.call(this);
        };
        BufferToggleSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            outerValue ? this.closeBuffer(outerValue) : this.openBuffer(innerValue);
        };
        BufferToggleSubscriber.prototype.notifyComplete = function (innerSub) {
            this.closeBuffer(innerSub.context);
        };
        BufferToggleSubscriber.prototype.openBuffer = function (value) {
            try {
                var closingSelector = this.closingSelector;
                var closingNotifier = closingSelector.call(this, value);
                if (closingNotifier) {
                    this.trySubscribe(closingNotifier);
                }
            }
            catch (err) {
                this._error(err);
            }
        };
        BufferToggleSubscriber.prototype.closeBuffer = function (context) {
            var contexts = this.contexts;
            if (contexts && context) {
                var buffer = context.buffer, subscription = context.subscription;
                this.destination.next(buffer);
                contexts.splice(contexts.indexOf(context), 1);
                this.remove(subscription);
                subscription.unsubscribe();
            }
        };
        BufferToggleSubscriber.prototype.trySubscribe = function (closingNotifier) {
            var contexts = this.contexts;
            var buffer = [];
            var subscription = new Subscription_10.Subscription();
            var context = { buffer: buffer, subscription: subscription };
            contexts.push(context);
            var innerSubscription = subscribeToResult_11.subscribeToResult(this, closingNotifier, context);
            if (!innerSubscription || innerSubscription.closed) {
                this.closeBuffer(context);
            }
            else {
                innerSubscription.context = context;
                this.add(innerSubscription);
                subscription.add(innerSubscription);
            }
        };
        return BufferToggleSubscriber;
    }(OuterSubscriber_11.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/bufferToggle", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/bufferToggle"], function (require, exports, Observable_61, bufferToggle_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_61.Observable.prototype.bufferToggle = bufferToggle_1.bufferToggle;
});
define("node_modules/rxjs/src/operator/bufferWhen", ["require", "exports", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subscription_11, tryCatch_7, errorObject_8, OuterSubscriber_12, subscribeToResult_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function bufferWhen(closingSelector) {
        return this.lift(new BufferWhenOperator(closingSelector));
    }
    exports.bufferWhen = bufferWhen;
    var BufferWhenOperator = (function () {
        function BufferWhenOperator(closingSelector) {
            this.closingSelector = closingSelector;
        }
        BufferWhenOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new BufferWhenSubscriber(subscriber, this.closingSelector));
        };
        return BufferWhenOperator;
    }());
    var BufferWhenSubscriber = (function (_super) {
        __extends(BufferWhenSubscriber, _super);
        function BufferWhenSubscriber(destination, closingSelector) {
            var _this = _super.call(this, destination) || this;
            _this.closingSelector = closingSelector;
            _this.subscribing = false;
            _this.openBuffer();
            return _this;
        }
        BufferWhenSubscriber.prototype._next = function (value) {
            this.buffer.push(value);
        };
        BufferWhenSubscriber.prototype._complete = function () {
            var buffer = this.buffer;
            if (buffer) {
                this.destination.next(buffer);
            }
            _super.prototype._complete.call(this);
        };
        BufferWhenSubscriber.prototype._unsubscribe = function () {
            this.buffer = null;
            this.subscribing = false;
        };
        BufferWhenSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.openBuffer();
        };
        BufferWhenSubscriber.prototype.notifyComplete = function () {
            if (this.subscribing) {
                this.complete();
            }
            else {
                this.openBuffer();
            }
        };
        BufferWhenSubscriber.prototype.openBuffer = function () {
            var closingSubscription = this.closingSubscription;
            if (closingSubscription) {
                this.remove(closingSubscription);
                closingSubscription.unsubscribe();
            }
            var buffer = this.buffer;
            if (this.buffer) {
                this.destination.next(buffer);
            }
            this.buffer = [];
            var closingNotifier = tryCatch_7.tryCatch(this.closingSelector)();
            if (closingNotifier === errorObject_8.errorObject) {
                this.error(errorObject_8.errorObject.e);
            }
            else {
                closingSubscription = new Subscription_11.Subscription();
                this.closingSubscription = closingSubscription;
                this.add(closingSubscription);
                this.subscribing = true;
                closingSubscription.add(subscribeToResult_12.subscribeToResult(this, closingNotifier));
                this.subscribing = false;
            }
        };
        return BufferWhenSubscriber;
    }(OuterSubscriber_12.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/bufferWhen", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/bufferWhen"], function (require, exports, Observable_62, bufferWhen_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_62.Observable.prototype.bufferWhen = bufferWhen_1.bufferWhen;
});
define("node_modules/rxjs/src/operator/catch", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_13, subscribeToResult_13) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function _catch(selector) {
        var operator = new CatchOperator(selector);
        var caught = this.lift(operator);
        return (operator.caught = caught);
    }
    exports._catch = _catch;
    var CatchOperator = (function () {
        function CatchOperator(selector) {
            this.selector = selector;
        }
        CatchOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new CatchSubscriber(subscriber, this.selector, this.caught));
        };
        return CatchOperator;
    }());
    var CatchSubscriber = (function (_super) {
        __extends(CatchSubscriber, _super);
        function CatchSubscriber(destination, selector, caught) {
            var _this = _super.call(this, destination) || this;
            _this.selector = selector;
            _this.caught = caught;
            return _this;
        }
        CatchSubscriber.prototype.error = function (err) {
            if (!this.isStopped) {
                var result = void 0;
                try {
                    result = this.selector(err, this.caught);
                }
                catch (err2) {
                    _super.prototype.error.call(this, err2);
                    return;
                }
                this._unsubscribeAndRecycle();
                this.add(subscribeToResult_13.subscribeToResult(this, result));
            }
        };
        return CatchSubscriber;
    }(OuterSubscriber_13.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/catch", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/catch"], function (require, exports, Observable_63, catch_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_63.Observable.prototype.catch = catch_1._catch;
    Observable_63.Observable.prototype._catch = catch_1._catch;
});
define("node_modules/rxjs/src/operator/combineAll", ["require", "exports", "node_modules/rxjs/src/operator/combineLatest"], function (require, exports, combineLatest_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function combineAll(project) {
        return this.lift(new combineLatest_3.CombineLatestOperator(project));
    }
    exports.combineAll = combineAll;
});
define("node_modules/rxjs/src/add/operator/combineAll", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/combineAll"], function (require, exports, Observable_64, combineAll_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_64.Observable.prototype.combineAll = combineAll_1.combineAll;
});
define("node_modules/rxjs/src/add/operator/combineLatest", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/combineLatest"], function (require, exports, Observable_65, combineLatest_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_65.Observable.prototype.combineLatest = combineLatest_4.combineLatest;
});
define("node_modules/rxjs/src/add/operator/concat", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/concat"], function (require, exports, Observable_66, concat_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_66.Observable.prototype.concat = concat_3.concat;
});
define("node_modules/rxjs/src/operator/concatAll", ["require", "exports", "node_modules/rxjs/src/operator/mergeAll"], function (require, exports, mergeAll_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function concatAll() {
        return this.lift(new mergeAll_3.MergeAllOperator(1));
    }
    exports.concatAll = concatAll;
});
define("node_modules/rxjs/src/add/operator/concatAll", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/concatAll"], function (require, exports, Observable_67, concatAll_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_67.Observable.prototype.concatAll = concatAll_1.concatAll;
});
define("node_modules/rxjs/src/operator/mergeMap", ["require", "exports", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, subscribeToResult_14, OuterSubscriber_14) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function mergeMap(project, resultSelector, concurrent) {
        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
        if (typeof resultSelector === 'number') {
            concurrent = resultSelector;
            resultSelector = null;
        }
        return this.lift(new MergeMapOperator(project, resultSelector, concurrent));
    }
    exports.mergeMap = mergeMap;
    var MergeMapOperator = (function () {
        function MergeMapOperator(project, resultSelector, concurrent) {
            if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
            this.project = project;
            this.resultSelector = resultSelector;
            this.concurrent = concurrent;
        }
        MergeMapOperator.prototype.call = function (observer, source) {
            return source.subscribe(new MergeMapSubscriber(observer, this.project, this.resultSelector, this.concurrent));
        };
        return MergeMapOperator;
    }());
    exports.MergeMapOperator = MergeMapOperator;
    var MergeMapSubscriber = (function (_super) {
        __extends(MergeMapSubscriber, _super);
        function MergeMapSubscriber(destination, project, resultSelector, concurrent) {
            if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.resultSelector = resultSelector;
            _this.concurrent = concurrent;
            _this.hasCompleted = false;
            _this.buffer = [];
            _this.active = 0;
            _this.index = 0;
            return _this;
        }
        MergeMapSubscriber.prototype._next = function (value) {
            if (this.active < this.concurrent) {
                this._tryNext(value);
            }
            else {
                this.buffer.push(value);
            }
        };
        MergeMapSubscriber.prototype._tryNext = function (value) {
            var result;
            var index = this.index++;
            try {
                result = this.project(value, index);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.active++;
            this._innerSub(result, value, index);
        };
        MergeMapSubscriber.prototype._innerSub = function (ish, value, index) {
            this.add(subscribeToResult_14.subscribeToResult(this, ish, value, index));
        };
        MergeMapSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.active === 0 && this.buffer.length === 0) {
                this.destination.complete();
            }
        };
        MergeMapSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            if (this.resultSelector) {
                this._notifyResultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            else {
                this.destination.next(innerValue);
            }
        };
        MergeMapSubscriber.prototype._notifyResultSelector = function (outerValue, innerValue, outerIndex, innerIndex) {
            var result;
            try {
                result = this.resultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        MergeMapSubscriber.prototype.notifyComplete = function (innerSub) {
            var buffer = this.buffer;
            this.remove(innerSub);
            this.active--;
            if (buffer.length > 0) {
                this._next(buffer.shift());
            }
            else if (this.active === 0 && this.hasCompleted) {
                this.destination.complete();
            }
        };
        return MergeMapSubscriber;
    }(OuterSubscriber_14.OuterSubscriber));
    exports.MergeMapSubscriber = MergeMapSubscriber;
});
define("node_modules/rxjs/src/operator/concatMap", ["require", "exports", "node_modules/rxjs/src/operator/mergeMap"], function (require, exports, mergeMap_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function concatMap(project, resultSelector) {
        return this.lift(new mergeMap_1.MergeMapOperator(project, resultSelector, 1));
    }
    exports.concatMap = concatMap;
});
define("node_modules/rxjs/src/add/operator/concatMap", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/concatMap"], function (require, exports, Observable_68, concatMap_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_68.Observable.prototype.concatMap = concatMap_1.concatMap;
});
define("node_modules/rxjs/src/operator/mergeMapTo", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_15, subscribeToResult_15) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function mergeMapTo(innerObservable, resultSelector, concurrent) {
        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
        if (typeof resultSelector === 'number') {
            concurrent = resultSelector;
            resultSelector = null;
        }
        return this.lift(new MergeMapToOperator(innerObservable, resultSelector, concurrent));
    }
    exports.mergeMapTo = mergeMapTo;
    var MergeMapToOperator = (function () {
        function MergeMapToOperator(ish, resultSelector, concurrent) {
            if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
            this.ish = ish;
            this.resultSelector = resultSelector;
            this.concurrent = concurrent;
        }
        MergeMapToOperator.prototype.call = function (observer, source) {
            return source.subscribe(new MergeMapToSubscriber(observer, this.ish, this.resultSelector, this.concurrent));
        };
        return MergeMapToOperator;
    }());
    exports.MergeMapToOperator = MergeMapToOperator;
    var MergeMapToSubscriber = (function (_super) {
        __extends(MergeMapToSubscriber, _super);
        function MergeMapToSubscriber(destination, ish, resultSelector, concurrent) {
            if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
            var _this = _super.call(this, destination) || this;
            _this.ish = ish;
            _this.resultSelector = resultSelector;
            _this.concurrent = concurrent;
            _this.hasCompleted = false;
            _this.buffer = [];
            _this.active = 0;
            _this.index = 0;
            return _this;
        }
        MergeMapToSubscriber.prototype._next = function (value) {
            if (this.active < this.concurrent) {
                var resultSelector = this.resultSelector;
                var index = this.index++;
                var ish = this.ish;
                var destination = this.destination;
                this.active++;
                this._innerSub(ish, destination, resultSelector, value, index);
            }
            else {
                this.buffer.push(value);
            }
        };
        MergeMapToSubscriber.prototype._innerSub = function (ish, destination, resultSelector, value, index) {
            this.add(subscribeToResult_15.subscribeToResult(this, ish, value, index));
        };
        MergeMapToSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.active === 0 && this.buffer.length === 0) {
                this.destination.complete();
            }
        };
        MergeMapToSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            if (resultSelector) {
                this.trySelectResult(outerValue, innerValue, outerIndex, innerIndex);
            }
            else {
                destination.next(innerValue);
            }
        };
        MergeMapToSubscriber.prototype.trySelectResult = function (outerValue, innerValue, outerIndex, innerIndex) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            var result;
            try {
                result = resultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            catch (err) {
                destination.error(err);
                return;
            }
            destination.next(result);
        };
        MergeMapToSubscriber.prototype.notifyError = function (err) {
            this.destination.error(err);
        };
        MergeMapToSubscriber.prototype.notifyComplete = function (innerSub) {
            var buffer = this.buffer;
            this.remove(innerSub);
            this.active--;
            if (buffer.length > 0) {
                this._next(buffer.shift());
            }
            else if (this.active === 0 && this.hasCompleted) {
                this.destination.complete();
            }
        };
        return MergeMapToSubscriber;
    }(OuterSubscriber_15.OuterSubscriber));
    exports.MergeMapToSubscriber = MergeMapToSubscriber;
});
define("node_modules/rxjs/src/operator/concatMapTo", ["require", "exports", "node_modules/rxjs/src/operator/mergeMapTo"], function (require, exports, mergeMapTo_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function concatMapTo(innerObservable, resultSelector) {
        return this.lift(new mergeMapTo_1.MergeMapToOperator(innerObservable, resultSelector, 1));
    }
    exports.concatMapTo = concatMapTo;
});
define("node_modules/rxjs/src/add/operator/concatMapTo", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/concatMapTo"], function (require, exports, Observable_69, concatMapTo_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_69.Observable.prototype.concatMapTo = concatMapTo_1.concatMapTo;
});
define("node_modules/rxjs/src/operator/count", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function count(predicate) {
        return this.lift(new CountOperator(predicate, this));
    }
    exports.count = count;
    var CountOperator = (function () {
        function CountOperator(predicate, source) {
            this.predicate = predicate;
            this.source = source;
        }
        CountOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new CountSubscriber(subscriber, this.predicate, this.source));
        };
        return CountOperator;
    }());
    var CountSubscriber = (function (_super) {
        __extends(CountSubscriber, _super);
        function CountSubscriber(destination, predicate, source) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.source = source;
            _this.count = 0;
            _this.index = 0;
            return _this;
        }
        CountSubscriber.prototype._next = function (value) {
            if (this.predicate) {
                this._tryPredicate(value);
            }
            else {
                this.count++;
            }
        };
        CountSubscriber.prototype._tryPredicate = function (value) {
            var result;
            try {
                result = this.predicate(value, this.index++, this.source);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            if (result) {
                this.count++;
            }
        };
        CountSubscriber.prototype._complete = function () {
            this.destination.next(this.count);
            this.destination.complete();
        };
        return CountSubscriber;
    }(Subscriber_12.Subscriber));
});
define("node_modules/rxjs/src/add/operator/count", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/count"], function (require, exports, Observable_70, count_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_70.Observable.prototype.count = count_1.count;
});
define("node_modules/rxjs/src/operator/dematerialize", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_13) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function dematerialize() {
        return this.lift(new DeMaterializeOperator());
    }
    exports.dematerialize = dematerialize;
    var DeMaterializeOperator = (function () {
        function DeMaterializeOperator() {
        }
        DeMaterializeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DeMaterializeSubscriber(subscriber));
        };
        return DeMaterializeOperator;
    }());
    var DeMaterializeSubscriber = (function (_super) {
        __extends(DeMaterializeSubscriber, _super);
        function DeMaterializeSubscriber(destination) {
            return _super.call(this, destination) || this;
        }
        DeMaterializeSubscriber.prototype._next = function (value) {
            value.observe(this.destination);
        };
        return DeMaterializeSubscriber;
    }(Subscriber_13.Subscriber));
});
define("node_modules/rxjs/src/add/operator/dematerialize", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/dematerialize"], function (require, exports, Observable_71, dematerialize_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_71.Observable.prototype.dematerialize = dematerialize_1.dematerialize;
});
define("node_modules/rxjs/src/operator/debounce", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_16, subscribeToResult_16) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function debounce(durationSelector) {
        return this.lift(new DebounceOperator(durationSelector));
    }
    exports.debounce = debounce;
    var DebounceOperator = (function () {
        function DebounceOperator(durationSelector) {
            this.durationSelector = durationSelector;
        }
        DebounceOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DebounceSubscriber(subscriber, this.durationSelector));
        };
        return DebounceOperator;
    }());
    var DebounceSubscriber = (function (_super) {
        __extends(DebounceSubscriber, _super);
        function DebounceSubscriber(destination, durationSelector) {
            var _this = _super.call(this, destination) || this;
            _this.durationSelector = durationSelector;
            _this.hasValue = false;
            _this.durationSubscription = null;
            return _this;
        }
        DebounceSubscriber.prototype._next = function (value) {
            try {
                var result = this.durationSelector.call(this, value);
                if (result) {
                    this._tryNext(value, result);
                }
            }
            catch (err) {
                this.destination.error(err);
            }
        };
        DebounceSubscriber.prototype._complete = function () {
            this.emitValue();
            this.destination.complete();
        };
        DebounceSubscriber.prototype._tryNext = function (value, duration) {
            var subscription = this.durationSubscription;
            this.value = value;
            this.hasValue = true;
            if (subscription) {
                subscription.unsubscribe();
                this.remove(subscription);
            }
            subscription = subscribeToResult_16.subscribeToResult(this, duration);
            if (!subscription.closed) {
                this.add(this.durationSubscription = subscription);
            }
        };
        DebounceSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.emitValue();
        };
        DebounceSubscriber.prototype.notifyComplete = function () {
            this.emitValue();
        };
        DebounceSubscriber.prototype.emitValue = function () {
            if (this.hasValue) {
                var value = this.value;
                var subscription = this.durationSubscription;
                if (subscription) {
                    this.durationSubscription = null;
                    subscription.unsubscribe();
                    this.remove(subscription);
                }
                this.value = null;
                this.hasValue = false;
                _super.prototype._next.call(this, value);
            }
        };
        return DebounceSubscriber;
    }(OuterSubscriber_16.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/debounce", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/debounce"], function (require, exports, Observable_72, debounce_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_72.Observable.prototype.debounce = debounce_1.debounce;
});
define("node_modules/rxjs/src/operator/debounceTime", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/scheduler/async"], function (require, exports, Subscriber_14, async_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function debounceTime(dueTime, scheduler) {
        if (scheduler === void 0) { scheduler = async_4.async; }
        return this.lift(new DebounceTimeOperator(dueTime, scheduler));
    }
    exports.debounceTime = debounceTime;
    var DebounceTimeOperator = (function () {
        function DebounceTimeOperator(dueTime, scheduler) {
            this.dueTime = dueTime;
            this.scheduler = scheduler;
        }
        DebounceTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DebounceTimeSubscriber(subscriber, this.dueTime, this.scheduler));
        };
        return DebounceTimeOperator;
    }());
    var DebounceTimeSubscriber = (function (_super) {
        __extends(DebounceTimeSubscriber, _super);
        function DebounceTimeSubscriber(destination, dueTime, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.dueTime = dueTime;
            _this.scheduler = scheduler;
            _this.debouncedSubscription = null;
            _this.lastValue = null;
            _this.hasValue = false;
            return _this;
        }
        DebounceTimeSubscriber.prototype._next = function (value) {
            this.clearDebounce();
            this.lastValue = value;
            this.hasValue = true;
            this.add(this.debouncedSubscription = this.scheduler.schedule(dispatchNext, this.dueTime, this));
        };
        DebounceTimeSubscriber.prototype._complete = function () {
            this.debouncedNext();
            this.destination.complete();
        };
        DebounceTimeSubscriber.prototype.debouncedNext = function () {
            this.clearDebounce();
            if (this.hasValue) {
                this.destination.next(this.lastValue);
                this.lastValue = null;
                this.hasValue = false;
            }
        };
        DebounceTimeSubscriber.prototype.clearDebounce = function () {
            var debouncedSubscription = this.debouncedSubscription;
            if (debouncedSubscription !== null) {
                this.remove(debouncedSubscription);
                debouncedSubscription.unsubscribe();
                this.debouncedSubscription = null;
            }
        };
        return DebounceTimeSubscriber;
    }(Subscriber_14.Subscriber));
    function dispatchNext(subscriber) {
        subscriber.debouncedNext();
    }
});
define("node_modules/rxjs/src/add/operator/debounceTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/debounceTime"], function (require, exports, Observable_73, debounceTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_73.Observable.prototype.debounceTime = debounceTime_1.debounceTime;
});
define("node_modules/rxjs/src/operator/defaultIfEmpty", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_15) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function defaultIfEmpty(defaultValue) {
        if (defaultValue === void 0) { defaultValue = null; }
        return this.lift(new DefaultIfEmptyOperator(defaultValue));
    }
    exports.defaultIfEmpty = defaultIfEmpty;
    var DefaultIfEmptyOperator = (function () {
        function DefaultIfEmptyOperator(defaultValue) {
            this.defaultValue = defaultValue;
        }
        DefaultIfEmptyOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DefaultIfEmptySubscriber(subscriber, this.defaultValue));
        };
        return DefaultIfEmptyOperator;
    }());
    var DefaultIfEmptySubscriber = (function (_super) {
        __extends(DefaultIfEmptySubscriber, _super);
        function DefaultIfEmptySubscriber(destination, defaultValue) {
            var _this = _super.call(this, destination) || this;
            _this.defaultValue = defaultValue;
            _this.isEmpty = true;
            return _this;
        }
        DefaultIfEmptySubscriber.prototype._next = function (value) {
            this.isEmpty = false;
            this.destination.next(value);
        };
        DefaultIfEmptySubscriber.prototype._complete = function () {
            if (this.isEmpty) {
                this.destination.next(this.defaultValue);
            }
            this.destination.complete();
        };
        return DefaultIfEmptySubscriber;
    }(Subscriber_15.Subscriber));
});
define("node_modules/rxjs/src/add/operator/defaultIfEmpty", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/defaultIfEmpty"], function (require, exports, Observable_74, defaultIfEmpty_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_74.Observable.prototype.defaultIfEmpty = defaultIfEmpty_1.defaultIfEmpty;
});
define("node_modules/rxjs/src/operator/delay", ["require", "exports", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/util/isDate", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Notification"], function (require, exports, async_5, isDate_2, Subscriber_16, Notification_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function delay(delay, scheduler) {
        if (scheduler === void 0) { scheduler = async_5.async; }
        var absoluteDelay = isDate_2.isDate(delay);
        var delayFor = absoluteDelay ? (+delay - scheduler.now()) : Math.abs(delay);
        return this.lift(new DelayOperator(delayFor, scheduler));
    }
    exports.delay = delay;
    var DelayOperator = (function () {
        function DelayOperator(delay, scheduler) {
            this.delay = delay;
            this.scheduler = scheduler;
        }
        DelayOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DelaySubscriber(subscriber, this.delay, this.scheduler));
        };
        return DelayOperator;
    }());
    var DelaySubscriber = (function (_super) {
        __extends(DelaySubscriber, _super);
        function DelaySubscriber(destination, delay, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.delay = delay;
            _this.scheduler = scheduler;
            _this.queue = [];
            _this.active = false;
            _this.errored = false;
            return _this;
        }
        DelaySubscriber.dispatch = function (state) {
            var source = state.source;
            var queue = source.queue;
            var scheduler = state.scheduler;
            var destination = state.destination;
            while (queue.length > 0 && (queue[0].time - scheduler.now()) <= 0) {
                queue.shift().notification.observe(destination);
            }
            if (queue.length > 0) {
                var delay_1 = Math.max(0, queue[0].time - scheduler.now());
                this.schedule(state, delay_1);
            }
            else {
                source.active = false;
            }
        };
        DelaySubscriber.prototype._schedule = function (scheduler) {
            this.active = true;
            this.add(scheduler.schedule(DelaySubscriber.dispatch, this.delay, {
                source: this, destination: this.destination, scheduler: scheduler
            }));
        };
        DelaySubscriber.prototype.scheduleNotification = function (notification) {
            if (this.errored === true) {
                return;
            }
            var scheduler = this.scheduler;
            var message = new DelayMessage(scheduler.now() + this.delay, notification);
            this.queue.push(message);
            if (this.active === false) {
                this._schedule(scheduler);
            }
        };
        DelaySubscriber.prototype._next = function (value) {
            this.scheduleNotification(Notification_2.Notification.createNext(value));
        };
        DelaySubscriber.prototype._error = function (err) {
            this.errored = true;
            this.queue = [];
            this.destination.error(err);
        };
        DelaySubscriber.prototype._complete = function () {
            this.scheduleNotification(Notification_2.Notification.createComplete());
        };
        return DelaySubscriber;
    }(Subscriber_16.Subscriber));
    var DelayMessage = (function () {
        function DelayMessage(time, notification) {
            this.time = time;
            this.notification = notification;
        }
        return DelayMessage;
    }());
});
define("node_modules/rxjs/src/add/operator/delay", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/delay"], function (require, exports, Observable_75, delay_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_75.Observable.prototype.delay = delay_2.delay;
});
define("node_modules/rxjs/src/operator/delayWhen", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subscriber_17, Observable_76, OuterSubscriber_17, subscribeToResult_17) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function delayWhen(delayDurationSelector, subscriptionDelay) {
        if (subscriptionDelay) {
            return new SubscriptionDelayObservable(this, subscriptionDelay)
                .lift(new DelayWhenOperator(delayDurationSelector));
        }
        return this.lift(new DelayWhenOperator(delayDurationSelector));
    }
    exports.delayWhen = delayWhen;
    var DelayWhenOperator = (function () {
        function DelayWhenOperator(delayDurationSelector) {
            this.delayDurationSelector = delayDurationSelector;
        }
        DelayWhenOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DelayWhenSubscriber(subscriber, this.delayDurationSelector));
        };
        return DelayWhenOperator;
    }());
    var DelayWhenSubscriber = (function (_super) {
        __extends(DelayWhenSubscriber, _super);
        function DelayWhenSubscriber(destination, delayDurationSelector) {
            var _this = _super.call(this, destination) || this;
            _this.delayDurationSelector = delayDurationSelector;
            _this.completed = false;
            _this.delayNotifierSubscriptions = [];
            _this.values = [];
            return _this;
        }
        DelayWhenSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.destination.next(outerValue);
            this.removeSubscription(innerSub);
            this.tryComplete();
        };
        DelayWhenSubscriber.prototype.notifyError = function (error, innerSub) {
            this._error(error);
        };
        DelayWhenSubscriber.prototype.notifyComplete = function (innerSub) {
            var value = this.removeSubscription(innerSub);
            if (value) {
                this.destination.next(value);
            }
            this.tryComplete();
        };
        DelayWhenSubscriber.prototype._next = function (value) {
            try {
                var delayNotifier = this.delayDurationSelector(value);
                if (delayNotifier) {
                    this.tryDelay(delayNotifier, value);
                }
            }
            catch (err) {
                this.destination.error(err);
            }
        };
        DelayWhenSubscriber.prototype._complete = function () {
            this.completed = true;
            this.tryComplete();
        };
        DelayWhenSubscriber.prototype.removeSubscription = function (subscription) {
            subscription.unsubscribe();
            var subscriptionIdx = this.delayNotifierSubscriptions.indexOf(subscription);
            var value = null;
            if (subscriptionIdx !== -1) {
                value = this.values[subscriptionIdx];
                this.delayNotifierSubscriptions.splice(subscriptionIdx, 1);
                this.values.splice(subscriptionIdx, 1);
            }
            return value;
        };
        DelayWhenSubscriber.prototype.tryDelay = function (delayNotifier, value) {
            var notifierSubscription = subscribeToResult_17.subscribeToResult(this, delayNotifier, value);
            this.add(notifierSubscription);
            this.delayNotifierSubscriptions.push(notifierSubscription);
            this.values.push(value);
        };
        DelayWhenSubscriber.prototype.tryComplete = function () {
            if (this.completed && this.delayNotifierSubscriptions.length === 0) {
                this.destination.complete();
            }
        };
        return DelayWhenSubscriber;
    }(OuterSubscriber_17.OuterSubscriber));
    var SubscriptionDelayObservable = (function (_super) {
        __extends(SubscriptionDelayObservable, _super);
        function SubscriptionDelayObservable(source, subscriptionDelay) {
            var _this = _super.call(this) || this;
            _this.source = source;
            _this.subscriptionDelay = subscriptionDelay;
            return _this;
        }
        SubscriptionDelayObservable.prototype._subscribe = function (subscriber) {
            this.subscriptionDelay.subscribe(new SubscriptionDelaySubscriber(subscriber, this.source));
        };
        return SubscriptionDelayObservable;
    }(Observable_76.Observable));
    var SubscriptionDelaySubscriber = (function (_super) {
        __extends(SubscriptionDelaySubscriber, _super);
        function SubscriptionDelaySubscriber(parent, source) {
            var _this = _super.call(this) || this;
            _this.parent = parent;
            _this.source = source;
            _this.sourceSubscribed = false;
            return _this;
        }
        SubscriptionDelaySubscriber.prototype._next = function (unused) {
            this.subscribeToSource();
        };
        SubscriptionDelaySubscriber.prototype._error = function (err) {
            this.unsubscribe();
            this.parent.error(err);
        };
        SubscriptionDelaySubscriber.prototype._complete = function () {
            this.subscribeToSource();
        };
        SubscriptionDelaySubscriber.prototype.subscribeToSource = function () {
            if (!this.sourceSubscribed) {
                this.sourceSubscribed = true;
                this.unsubscribe();
                this.source.subscribe(this.parent);
            }
        };
        return SubscriptionDelaySubscriber;
    }(Subscriber_17.Subscriber));
});
define("node_modules/rxjs/src/add/operator/delayWhen", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/delayWhen"], function (require, exports, Observable_77, delayWhen_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_77.Observable.prototype.delayWhen = delayWhen_1.delayWhen;
});
define("node_modules/rxjs/src/util/Set", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function minimalSetImpl() {
        return (function () {
            function MinimalSet() {
                this._values = [];
            }
            MinimalSet.prototype.add = function (value) {
                if (!this.has(value)) {
                    this._values.push(value);
                }
            };
            MinimalSet.prototype.has = function (value) {
                return this._values.indexOf(value) !== -1;
            };
            Object.defineProperty(MinimalSet.prototype, "size", {
                get: function () {
                    return this._values.length;
                },
                enumerable: true,
                configurable: true
            });
            MinimalSet.prototype.clear = function () {
                this._values.length = 0;
            };
            return MinimalSet;
        }());
    }
    exports.minimalSetImpl = minimalSetImpl;
    exports.Set = root_12.root.Set || minimalSetImpl();
});
define("node_modules/rxjs/src/operator/distinct", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/util/Set"], function (require, exports, OuterSubscriber_18, subscribeToResult_18, Set_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function distinct(keySelector, flushes) {
        return this.lift(new DistinctOperator(keySelector, flushes));
    }
    exports.distinct = distinct;
    var DistinctOperator = (function () {
        function DistinctOperator(keySelector, flushes) {
            this.keySelector = keySelector;
            this.flushes = flushes;
        }
        DistinctOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DistinctSubscriber(subscriber, this.keySelector, this.flushes));
        };
        return DistinctOperator;
    }());
    var DistinctSubscriber = (function (_super) {
        __extends(DistinctSubscriber, _super);
        function DistinctSubscriber(destination, keySelector, flushes) {
            var _this = _super.call(this, destination) || this;
            _this.keySelector = keySelector;
            _this.values = new Set_2.Set();
            if (flushes) {
                _this.add(subscribeToResult_18.subscribeToResult(_this, flushes));
            }
            return _this;
        }
        DistinctSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.values.clear();
        };
        DistinctSubscriber.prototype.notifyError = function (error, innerSub) {
            this._error(error);
        };
        DistinctSubscriber.prototype._next = function (value) {
            if (this.keySelector) {
                this._useKeySelector(value);
            }
            else {
                this._finalizeNext(value, value);
            }
        };
        DistinctSubscriber.prototype._useKeySelector = function (value) {
            var key;
            var destination = this.destination;
            try {
                key = this.keySelector(value);
            }
            catch (err) {
                destination.error(err);
                return;
            }
            this._finalizeNext(key, value);
        };
        DistinctSubscriber.prototype._finalizeNext = function (key, value) {
            var values = this.values;
            if (!values.has(key)) {
                values.add(key);
                this.destination.next(value);
            }
        };
        return DistinctSubscriber;
    }(OuterSubscriber_18.OuterSubscriber));
    exports.DistinctSubscriber = DistinctSubscriber;
});
define("node_modules/rxjs/src/add/operator/distinct", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/distinct"], function (require, exports, Observable_78, distinct_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_78.Observable.prototype.distinct = distinct_1.distinct;
});
define("node_modules/rxjs/src/operator/distinctUntilChanged", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject"], function (require, exports, Subscriber_18, tryCatch_8, errorObject_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function distinctUntilChanged(compare, keySelector) {
        return this.lift(new DistinctUntilChangedOperator(compare, keySelector));
    }
    exports.distinctUntilChanged = distinctUntilChanged;
    var DistinctUntilChangedOperator = (function () {
        function DistinctUntilChangedOperator(compare, keySelector) {
            this.compare = compare;
            this.keySelector = keySelector;
        }
        DistinctUntilChangedOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DistinctUntilChangedSubscriber(subscriber, this.compare, this.keySelector));
        };
        return DistinctUntilChangedOperator;
    }());
    var DistinctUntilChangedSubscriber = (function (_super) {
        __extends(DistinctUntilChangedSubscriber, _super);
        function DistinctUntilChangedSubscriber(destination, compare, keySelector) {
            var _this = _super.call(this, destination) || this;
            _this.keySelector = keySelector;
            _this.hasKey = false;
            if (typeof compare === 'function') {
                _this.compare = compare;
            }
            return _this;
        }
        DistinctUntilChangedSubscriber.prototype.compare = function (x, y) {
            return x === y;
        };
        DistinctUntilChangedSubscriber.prototype._next = function (value) {
            var keySelector = this.keySelector;
            var key = value;
            if (keySelector) {
                key = tryCatch_8.tryCatch(this.keySelector)(value);
                if (key === errorObject_9.errorObject) {
                    return this.destination.error(errorObject_9.errorObject.e);
                }
            }
            var result = false;
            if (this.hasKey) {
                result = tryCatch_8.tryCatch(this.compare)(this.key, key);
                if (result === errorObject_9.errorObject) {
                    return this.destination.error(errorObject_9.errorObject.e);
                }
            }
            else {
                this.hasKey = true;
            }
            if (Boolean(result) === false) {
                this.key = key;
                this.destination.next(value);
            }
        };
        return DistinctUntilChangedSubscriber;
    }(Subscriber_18.Subscriber));
});
define("node_modules/rxjs/src/add/operator/distinctUntilChanged", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/distinctUntilChanged"], function (require, exports, Observable_79, distinctUntilChanged_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_79.Observable.prototype.distinctUntilChanged = distinctUntilChanged_1.distinctUntilChanged;
});
define("node_modules/rxjs/src/operator/distinctUntilKeyChanged", ["require", "exports", "node_modules/rxjs/src/operator/distinctUntilChanged"], function (require, exports, distinctUntilChanged_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function distinctUntilKeyChanged(key, compare) {
        return distinctUntilChanged_2.distinctUntilChanged.call(this, function (x, y) {
            if (compare) {
                return compare(x[key], y[key]);
            }
            return x[key] === y[key];
        });
    }
    exports.distinctUntilKeyChanged = distinctUntilKeyChanged;
});
define("node_modules/rxjs/src/add/operator/distinctUntilKeyChanged", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/distinctUntilKeyChanged"], function (require, exports, Observable_80, distinctUntilKeyChanged_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_80.Observable.prototype.distinctUntilKeyChanged = distinctUntilKeyChanged_1.distinctUntilKeyChanged;
});
define("node_modules/rxjs/src/operator/do", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_19) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function _do(nextOrObserver, error, complete) {
        return this.lift(new DoOperator(nextOrObserver, error, complete));
    }
    exports._do = _do;
    var DoOperator = (function () {
        function DoOperator(nextOrObserver, error, complete) {
            this.nextOrObserver = nextOrObserver;
            this.error = error;
            this.complete = complete;
        }
        DoOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new DoSubscriber(subscriber, this.nextOrObserver, this.error, this.complete));
        };
        return DoOperator;
    }());
    var DoSubscriber = (function (_super) {
        __extends(DoSubscriber, _super);
        function DoSubscriber(destination, nextOrObserver, error, complete) {
            var _this = _super.call(this, destination) || this;
            var safeSubscriber = new Subscriber_19.Subscriber(nextOrObserver, error, complete);
            safeSubscriber.syncErrorThrowable = true;
            _this.add(safeSubscriber);
            _this.safeSubscriber = safeSubscriber;
            return _this;
        }
        DoSubscriber.prototype._next = function (value) {
            var safeSubscriber = this.safeSubscriber;
            safeSubscriber.next(value);
            if (safeSubscriber.syncErrorThrown) {
                this.destination.error(safeSubscriber.syncErrorValue);
            }
            else {
                this.destination.next(value);
            }
        };
        DoSubscriber.prototype._error = function (err) {
            var safeSubscriber = this.safeSubscriber;
            safeSubscriber.error(err);
            if (safeSubscriber.syncErrorThrown) {
                this.destination.error(safeSubscriber.syncErrorValue);
            }
            else {
                this.destination.error(err);
            }
        };
        DoSubscriber.prototype._complete = function () {
            var safeSubscriber = this.safeSubscriber;
            safeSubscriber.complete();
            if (safeSubscriber.syncErrorThrown) {
                this.destination.error(safeSubscriber.syncErrorValue);
            }
            else {
                this.destination.complete();
            }
        };
        return DoSubscriber;
    }(Subscriber_19.Subscriber));
});
define("node_modules/rxjs/src/add/operator/do", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/do"], function (require, exports, Observable_81, do_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_81.Observable.prototype.do = do_1._do;
    Observable_81.Observable.prototype._do = do_1._do;
});
define("node_modules/rxjs/src/operator/exhaust", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_19, subscribeToResult_19) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function exhaust() {
        return this.lift(new SwitchFirstOperator());
    }
    exports.exhaust = exhaust;
    var SwitchFirstOperator = (function () {
        function SwitchFirstOperator() {
        }
        SwitchFirstOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SwitchFirstSubscriber(subscriber));
        };
        return SwitchFirstOperator;
    }());
    var SwitchFirstSubscriber = (function (_super) {
        __extends(SwitchFirstSubscriber, _super);
        function SwitchFirstSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.hasCompleted = false;
            _this.hasSubscription = false;
            return _this;
        }
        SwitchFirstSubscriber.prototype._next = function (value) {
            if (!this.hasSubscription) {
                this.hasSubscription = true;
                this.add(subscribeToResult_19.subscribeToResult(this, value));
            }
        };
        SwitchFirstSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (!this.hasSubscription) {
                this.destination.complete();
            }
        };
        SwitchFirstSubscriber.prototype.notifyComplete = function (innerSub) {
            this.remove(innerSub);
            this.hasSubscription = false;
            if (this.hasCompleted) {
                this.destination.complete();
            }
        };
        return SwitchFirstSubscriber;
    }(OuterSubscriber_19.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/exhaust", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/exhaust"], function (require, exports, Observable_82, exhaust_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_82.Observable.prototype.exhaust = exhaust_1.exhaust;
});
define("node_modules/rxjs/src/operator/exhaustMap", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_20, subscribeToResult_20) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function exhaustMap(project, resultSelector) {
        return this.lift(new SwitchFirstMapOperator(project, resultSelector));
    }
    exports.exhaustMap = exhaustMap;
    var SwitchFirstMapOperator = (function () {
        function SwitchFirstMapOperator(project, resultSelector) {
            this.project = project;
            this.resultSelector = resultSelector;
        }
        SwitchFirstMapOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SwitchFirstMapSubscriber(subscriber, this.project, this.resultSelector));
        };
        return SwitchFirstMapOperator;
    }());
    var SwitchFirstMapSubscriber = (function (_super) {
        __extends(SwitchFirstMapSubscriber, _super);
        function SwitchFirstMapSubscriber(destination, project, resultSelector) {
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.resultSelector = resultSelector;
            _this.hasSubscription = false;
            _this.hasCompleted = false;
            _this.index = 0;
            return _this;
        }
        SwitchFirstMapSubscriber.prototype._next = function (value) {
            if (!this.hasSubscription) {
                this.tryNext(value);
            }
        };
        SwitchFirstMapSubscriber.prototype.tryNext = function (value) {
            var index = this.index++;
            var destination = this.destination;
            try {
                var result = this.project(value, index);
                this.hasSubscription = true;
                this.add(subscribeToResult_20.subscribeToResult(this, result, value, index));
            }
            catch (err) {
                destination.error(err);
            }
        };
        SwitchFirstMapSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (!this.hasSubscription) {
                this.destination.complete();
            }
        };
        SwitchFirstMapSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            if (resultSelector) {
                this.trySelectResult(outerValue, innerValue, outerIndex, innerIndex);
            }
            else {
                destination.next(innerValue);
            }
        };
        SwitchFirstMapSubscriber.prototype.trySelectResult = function (outerValue, innerValue, outerIndex, innerIndex) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            try {
                var result = resultSelector(outerValue, innerValue, outerIndex, innerIndex);
                destination.next(result);
            }
            catch (err) {
                destination.error(err);
            }
        };
        SwitchFirstMapSubscriber.prototype.notifyError = function (err) {
            this.destination.error(err);
        };
        SwitchFirstMapSubscriber.prototype.notifyComplete = function (innerSub) {
            this.remove(innerSub);
            this.hasSubscription = false;
            if (this.hasCompleted) {
                this.destination.complete();
            }
        };
        return SwitchFirstMapSubscriber;
    }(OuterSubscriber_20.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/exhaustMap", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/exhaustMap"], function (require, exports, Observable_83, exhaustMap_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_83.Observable.prototype.exhaustMap = exhaustMap_1.exhaustMap;
});
define("node_modules/rxjs/src/operator/expand", ["require", "exports", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, tryCatch_9, errorObject_10, OuterSubscriber_21, subscribeToResult_21) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function expand(project, concurrent, scheduler) {
        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
        if (scheduler === void 0) { scheduler = undefined; }
        concurrent = (concurrent || 0) < 1 ? Number.POSITIVE_INFINITY : concurrent;
        return this.lift(new ExpandOperator(project, concurrent, scheduler));
    }
    exports.expand = expand;
    var ExpandOperator = (function () {
        function ExpandOperator(project, concurrent, scheduler) {
            this.project = project;
            this.concurrent = concurrent;
            this.scheduler = scheduler;
        }
        ExpandOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ExpandSubscriber(subscriber, this.project, this.concurrent, this.scheduler));
        };
        return ExpandOperator;
    }());
    exports.ExpandOperator = ExpandOperator;
    var ExpandSubscriber = (function (_super) {
        __extends(ExpandSubscriber, _super);
        function ExpandSubscriber(destination, project, concurrent, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.concurrent = concurrent;
            _this.scheduler = scheduler;
            _this.index = 0;
            _this.active = 0;
            _this.hasCompleted = false;
            if (concurrent < Number.POSITIVE_INFINITY) {
                _this.buffer = [];
            }
            return _this;
        }
        ExpandSubscriber.dispatch = function (arg) {
            var subscriber = arg.subscriber, result = arg.result, value = arg.value, index = arg.index;
            subscriber.subscribeToProjection(result, value, index);
        };
        ExpandSubscriber.prototype._next = function (value) {
            var destination = this.destination;
            if (destination.closed) {
                this._complete();
                return;
            }
            var index = this.index++;
            if (this.active < this.concurrent) {
                destination.next(value);
                var result = tryCatch_9.tryCatch(this.project)(value, index);
                if (result === errorObject_10.errorObject) {
                    destination.error(errorObject_10.errorObject.e);
                }
                else if (!this.scheduler) {
                    this.subscribeToProjection(result, value, index);
                }
                else {
                    var state = { subscriber: this, result: result, value: value, index: index };
                    this.add(this.scheduler.schedule(ExpandSubscriber.dispatch, 0, state));
                }
            }
            else {
                this.buffer.push(value);
            }
        };
        ExpandSubscriber.prototype.subscribeToProjection = function (result, value, index) {
            this.active++;
            this.add(subscribeToResult_21.subscribeToResult(this, result, value, index));
        };
        ExpandSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.hasCompleted && this.active === 0) {
                this.destination.complete();
            }
        };
        ExpandSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this._next(innerValue);
        };
        ExpandSubscriber.prototype.notifyComplete = function (innerSub) {
            var buffer = this.buffer;
            this.remove(innerSub);
            this.active--;
            if (buffer && buffer.length > 0) {
                this._next(buffer.shift());
            }
            if (this.hasCompleted && this.active === 0) {
                this.destination.complete();
            }
        };
        return ExpandSubscriber;
    }(OuterSubscriber_21.OuterSubscriber));
    exports.ExpandSubscriber = ExpandSubscriber;
});
define("node_modules/rxjs/src/add/operator/expand", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/expand"], function (require, exports, Observable_84, expand_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_84.Observable.prototype.expand = expand_1.expand;
});
define("node_modules/rxjs/src/util/ArgumentOutOfRangeError", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ArgumentOutOfRangeError = (function (_super) {
        __extends(ArgumentOutOfRangeError, _super);
        function ArgumentOutOfRangeError() {
            var _this = this;
            var err = _this = _super.call(this, 'argument out of range') || this;
            _this.name = err.name = 'ArgumentOutOfRangeError';
            _this.stack = err.stack;
            _this.message = err.message;
            return _this;
        }
        return ArgumentOutOfRangeError;
    }(Error));
    exports.ArgumentOutOfRangeError = ArgumentOutOfRangeError;
});
define("node_modules/rxjs/src/operator/elementAt", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/ArgumentOutOfRangeError"], function (require, exports, Subscriber_20, ArgumentOutOfRangeError_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function elementAt(index, defaultValue) {
        return this.lift(new ElementAtOperator(index, defaultValue));
    }
    exports.elementAt = elementAt;
    var ElementAtOperator = (function () {
        function ElementAtOperator(index, defaultValue) {
            this.index = index;
            this.defaultValue = defaultValue;
            if (index < 0) {
                throw new ArgumentOutOfRangeError_1.ArgumentOutOfRangeError;
            }
        }
        ElementAtOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ElementAtSubscriber(subscriber, this.index, this.defaultValue));
        };
        return ElementAtOperator;
    }());
    var ElementAtSubscriber = (function (_super) {
        __extends(ElementAtSubscriber, _super);
        function ElementAtSubscriber(destination, index, defaultValue) {
            var _this = _super.call(this, destination) || this;
            _this.index = index;
            _this.defaultValue = defaultValue;
            return _this;
        }
        ElementAtSubscriber.prototype._next = function (x) {
            if (this.index-- === 0) {
                this.destination.next(x);
                this.destination.complete();
            }
        };
        ElementAtSubscriber.prototype._complete = function () {
            var destination = this.destination;
            if (this.index >= 0) {
                if (typeof this.defaultValue !== 'undefined') {
                    destination.next(this.defaultValue);
                }
                else {
                    destination.error(new ArgumentOutOfRangeError_1.ArgumentOutOfRangeError);
                }
            }
            destination.complete();
        };
        return ElementAtSubscriber;
    }(Subscriber_20.Subscriber));
});
define("node_modules/rxjs/src/add/operator/elementAt", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/elementAt"], function (require, exports, Observable_85, elementAt_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_85.Observable.prototype.elementAt = elementAt_1.elementAt;
});
define("node_modules/rxjs/src/operator/filter", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_21) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function filter(predicate, thisArg) {
        return this.lift(new FilterOperator(predicate, thisArg));
    }
    exports.filter = filter;
    var FilterOperator = (function () {
        function FilterOperator(predicate, thisArg) {
            this.predicate = predicate;
            this.thisArg = thisArg;
        }
        FilterOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new FilterSubscriber(subscriber, this.predicate, this.thisArg));
        };
        return FilterOperator;
    }());
    var FilterSubscriber = (function (_super) {
        __extends(FilterSubscriber, _super);
        function FilterSubscriber(destination, predicate, thisArg) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.thisArg = thisArg;
            _this.count = 0;
            _this.predicate = predicate;
            return _this;
        }
        FilterSubscriber.prototype._next = function (value) {
            var result;
            try {
                result = this.predicate.call(this.thisArg, value, this.count++);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            if (result) {
                this.destination.next(value);
            }
        };
        return FilterSubscriber;
    }(Subscriber_21.Subscriber));
});
define("node_modules/rxjs/src/add/operator/filter", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/filter"], function (require, exports, Observable_86, filter_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_86.Observable.prototype.filter = filter_1.filter;
});
define("node_modules/rxjs/src/operator/finally", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Subscription"], function (require, exports, Subscriber_22, Subscription_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function _finally(callback) {
        return this.lift(new FinallyOperator(callback));
    }
    exports._finally = _finally;
    var FinallyOperator = (function () {
        function FinallyOperator(callback) {
            this.callback = callback;
        }
        FinallyOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new FinallySubscriber(subscriber, this.callback));
        };
        return FinallyOperator;
    }());
    var FinallySubscriber = (function (_super) {
        __extends(FinallySubscriber, _super);
        function FinallySubscriber(destination, callback) {
            var _this = _super.call(this, destination) || this;
            _this.add(new Subscription_12.Subscription(callback));
            return _this;
        }
        return FinallySubscriber;
    }(Subscriber_22.Subscriber));
});
define("node_modules/rxjs/src/add/operator/finally", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/finally"], function (require, exports, Observable_87, finally_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_87.Observable.prototype.finally = finally_1._finally;
    Observable_87.Observable.prototype._finally = finally_1._finally;
});
define("node_modules/rxjs/src/operator/find", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_23) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function find(predicate, thisArg) {
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate is not a function');
        }
        return this.lift(new FindValueOperator(predicate, this, false, thisArg));
    }
    exports.find = find;
    var FindValueOperator = (function () {
        function FindValueOperator(predicate, source, yieldIndex, thisArg) {
            this.predicate = predicate;
            this.source = source;
            this.yieldIndex = yieldIndex;
            this.thisArg = thisArg;
        }
        FindValueOperator.prototype.call = function (observer, source) {
            return source.subscribe(new FindValueSubscriber(observer, this.predicate, this.source, this.yieldIndex, this.thisArg));
        };
        return FindValueOperator;
    }());
    exports.FindValueOperator = FindValueOperator;
    var FindValueSubscriber = (function (_super) {
        __extends(FindValueSubscriber, _super);
        function FindValueSubscriber(destination, predicate, source, yieldIndex, thisArg) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.source = source;
            _this.yieldIndex = yieldIndex;
            _this.thisArg = thisArg;
            _this.index = 0;
            return _this;
        }
        FindValueSubscriber.prototype.notifyComplete = function (value) {
            var destination = this.destination;
            destination.next(value);
            destination.complete();
        };
        FindValueSubscriber.prototype._next = function (value) {
            var _a = this, predicate = _a.predicate, thisArg = _a.thisArg;
            var index = this.index++;
            try {
                var result = predicate.call(thisArg || this, value, index, this.source);
                if (result) {
                    this.notifyComplete(this.yieldIndex ? index : value);
                }
            }
            catch (err) {
                this.destination.error(err);
            }
        };
        FindValueSubscriber.prototype._complete = function () {
            this.notifyComplete(this.yieldIndex ? -1 : undefined);
        };
        return FindValueSubscriber;
    }(Subscriber_23.Subscriber));
    exports.FindValueSubscriber = FindValueSubscriber;
});
define("node_modules/rxjs/src/add/operator/find", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/find"], function (require, exports, Observable_88, find_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_88.Observable.prototype.find = find_1.find;
});
define("node_modules/rxjs/src/operator/findIndex", ["require", "exports", "node_modules/rxjs/src/operator/find"], function (require, exports, find_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function findIndex(predicate, thisArg) {
        return this.lift(new find_2.FindValueOperator(predicate, this, true, thisArg));
    }
    exports.findIndex = findIndex;
});
define("node_modules/rxjs/src/add/operator/findIndex", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/findIndex"], function (require, exports, Observable_89, findIndex_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_89.Observable.prototype.findIndex = findIndex_1.findIndex;
});
define("node_modules/rxjs/src/util/EmptyError", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var EmptyError = (function (_super) {
        __extends(EmptyError, _super);
        function EmptyError() {
            var _this = this;
            var err = _this = _super.call(this, 'no elements in sequence') || this;
            _this.name = err.name = 'EmptyError';
            _this.stack = err.stack;
            _this.message = err.message;
            return _this;
        }
        return EmptyError;
    }(Error));
    exports.EmptyError = EmptyError;
});
define("node_modules/rxjs/src/operator/first", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/EmptyError"], function (require, exports, Subscriber_24, EmptyError_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function first(predicate, resultSelector, defaultValue) {
        return this.lift(new FirstOperator(predicate, resultSelector, defaultValue, this));
    }
    exports.first = first;
    var FirstOperator = (function () {
        function FirstOperator(predicate, resultSelector, defaultValue, source) {
            this.predicate = predicate;
            this.resultSelector = resultSelector;
            this.defaultValue = defaultValue;
            this.source = source;
        }
        FirstOperator.prototype.call = function (observer, source) {
            return source.subscribe(new FirstSubscriber(observer, this.predicate, this.resultSelector, this.defaultValue, this.source));
        };
        return FirstOperator;
    }());
    var FirstSubscriber = (function (_super) {
        __extends(FirstSubscriber, _super);
        function FirstSubscriber(destination, predicate, resultSelector, defaultValue, source) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.resultSelector = resultSelector;
            _this.defaultValue = defaultValue;
            _this.source = source;
            _this.index = 0;
            _this.hasCompleted = false;
            _this._emitted = false;
            return _this;
        }
        FirstSubscriber.prototype._next = function (value) {
            var index = this.index++;
            if (this.predicate) {
                this._tryPredicate(value, index);
            }
            else {
                this._emit(value, index);
            }
        };
        FirstSubscriber.prototype._tryPredicate = function (value, index) {
            var result;
            try {
                result = this.predicate(value, index, this.source);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            if (result) {
                this._emit(value, index);
            }
        };
        FirstSubscriber.prototype._emit = function (value, index) {
            if (this.resultSelector) {
                this._tryResultSelector(value, index);
                return;
            }
            this._emitFinal(value);
        };
        FirstSubscriber.prototype._tryResultSelector = function (value, index) {
            var result;
            try {
                result = this.resultSelector(value, index);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this._emitFinal(result);
        };
        FirstSubscriber.prototype._emitFinal = function (value) {
            var destination = this.destination;
            if (!this._emitted) {
                this._emitted = true;
                destination.next(value);
                destination.complete();
                this.hasCompleted = true;
            }
        };
        FirstSubscriber.prototype._complete = function () {
            var destination = this.destination;
            if (!this.hasCompleted && typeof this.defaultValue !== 'undefined') {
                destination.next(this.defaultValue);
                destination.complete();
            }
            else if (!this.hasCompleted) {
                destination.error(new EmptyError_1.EmptyError);
            }
        };
        return FirstSubscriber;
    }(Subscriber_24.Subscriber));
});
define("node_modules/rxjs/src/add/operator/first", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/first"], function (require, exports, Observable_90, first_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_90.Observable.prototype.first = first_1.first;
});
define("node_modules/rxjs/src/util/MapPolyfill", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var MapPolyfill = (function () {
        function MapPolyfill() {
            this.size = 0;
            this._values = [];
            this._keys = [];
        }
        MapPolyfill.prototype.get = function (key) {
            var i = this._keys.indexOf(key);
            return i === -1 ? undefined : this._values[i];
        };
        MapPolyfill.prototype.set = function (key, value) {
            var i = this._keys.indexOf(key);
            if (i === -1) {
                this._keys.push(key);
                this._values.push(value);
                this.size++;
            }
            else {
                this._values[i] = value;
            }
            return this;
        };
        MapPolyfill.prototype.delete = function (key) {
            var i = this._keys.indexOf(key);
            if (i === -1) {
                return false;
            }
            this._values.splice(i, 1);
            this._keys.splice(i, 1);
            this.size--;
            return true;
        };
        MapPolyfill.prototype.clear = function () {
            this._keys.length = 0;
            this._values.length = 0;
            this.size = 0;
        };
        MapPolyfill.prototype.forEach = function (cb, thisArg) {
            for (var i = 0; i < this.size; i++) {
                cb.call(thisArg, this._values[i], this._keys[i]);
            }
        };
        return MapPolyfill;
    }());
    exports.MapPolyfill = MapPolyfill;
});
define("node_modules/rxjs/src/util/Map", ["require", "exports", "node_modules/rxjs/src/util/root", "node_modules/rxjs/src/util/MapPolyfill"], function (require, exports, root_13, MapPolyfill_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Map = root_13.root.Map || (function () { return MapPolyfill_1.MapPolyfill; })();
});
define("node_modules/rxjs/src/util/FastMap", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var FastMap = (function () {
        function FastMap() {
            this.values = {};
        }
        FastMap.prototype.delete = function (key) {
            this.values[key] = null;
            return true;
        };
        FastMap.prototype.set = function (key, value) {
            this.values[key] = value;
            return this;
        };
        FastMap.prototype.get = function (key) {
            return this.values[key];
        };
        FastMap.prototype.forEach = function (cb, thisArg) {
            var values = this.values;
            for (var key in values) {
                if (values.hasOwnProperty(key) && values[key] !== null) {
                    cb.call(thisArg, values[key], key);
                }
            }
        };
        FastMap.prototype.clear = function () {
            this.values = {};
        };
        return FastMap;
    }());
    exports.FastMap = FastMap;
});
define("node_modules/rxjs/src/operator/groupBy", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/util/Map", "node_modules/rxjs/src/util/FastMap"], function (require, exports, Subscriber_25, Subscription_13, Observable_91, Subject_5, Map_2, FastMap_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function groupBy(keySelector, elementSelector, durationSelector, subjectSelector) {
        return this.lift(new GroupByOperator(keySelector, elementSelector, durationSelector, subjectSelector));
    }
    exports.groupBy = groupBy;
    var GroupByOperator = (function () {
        function GroupByOperator(keySelector, elementSelector, durationSelector, subjectSelector) {
            this.keySelector = keySelector;
            this.elementSelector = elementSelector;
            this.durationSelector = durationSelector;
            this.subjectSelector = subjectSelector;
        }
        GroupByOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new GroupBySubscriber(subscriber, this.keySelector, this.elementSelector, this.durationSelector, this.subjectSelector));
        };
        return GroupByOperator;
    }());
    var GroupBySubscriber = (function (_super) {
        __extends(GroupBySubscriber, _super);
        function GroupBySubscriber(destination, keySelector, elementSelector, durationSelector, subjectSelector) {
            var _this = _super.call(this, destination) || this;
            _this.keySelector = keySelector;
            _this.elementSelector = elementSelector;
            _this.durationSelector = durationSelector;
            _this.subjectSelector = subjectSelector;
            _this.groups = null;
            _this.attemptedToUnsubscribe = false;
            _this.count = 0;
            return _this;
        }
        GroupBySubscriber.prototype._next = function (value) {
            var key;
            try {
                key = this.keySelector(value);
            }
            catch (err) {
                this.error(err);
                return;
            }
            this._group(value, key);
        };
        GroupBySubscriber.prototype._group = function (value, key) {
            var groups = this.groups;
            if (!groups) {
                groups = this.groups = typeof key === 'string' ? new FastMap_1.FastMap() : new Map_2.Map();
            }
            var group = groups.get(key);
            var element;
            if (this.elementSelector) {
                try {
                    element = this.elementSelector(value);
                }
                catch (err) {
                    this.error(err);
                }
            }
            else {
                element = value;
            }
            if (!group) {
                group = this.subjectSelector ? this.subjectSelector() : new Subject_5.Subject();
                groups.set(key, group);
                var groupedObservable = new GroupedObservable(key, group, this);
                this.destination.next(groupedObservable);
                if (this.durationSelector) {
                    var duration = void 0;
                    try {
                        duration = this.durationSelector(new GroupedObservable(key, group));
                    }
                    catch (err) {
                        this.error(err);
                        return;
                    }
                    this.add(duration.subscribe(new GroupDurationSubscriber(key, group, this)));
                }
            }
            if (!group.closed) {
                group.next(element);
            }
        };
        GroupBySubscriber.prototype._error = function (err) {
            var groups = this.groups;
            if (groups) {
                groups.forEach(function (group, key) {
                    group.error(err);
                });
                groups.clear();
            }
            this.destination.error(err);
        };
        GroupBySubscriber.prototype._complete = function () {
            var groups = this.groups;
            if (groups) {
                groups.forEach(function (group, key) {
                    group.complete();
                });
                groups.clear();
            }
            this.destination.complete();
        };
        GroupBySubscriber.prototype.removeGroup = function (key) {
            this.groups.delete(key);
        };
        GroupBySubscriber.prototype.unsubscribe = function () {
            if (!this.closed) {
                this.attemptedToUnsubscribe = true;
                if (this.count === 0) {
                    _super.prototype.unsubscribe.call(this);
                }
            }
        };
        return GroupBySubscriber;
    }(Subscriber_25.Subscriber));
    var GroupDurationSubscriber = (function (_super) {
        __extends(GroupDurationSubscriber, _super);
        function GroupDurationSubscriber(key, group, parent) {
            var _this = _super.call(this) || this;
            _this.key = key;
            _this.group = group;
            _this.parent = parent;
            return _this;
        }
        GroupDurationSubscriber.prototype._next = function (value) {
            this._complete();
        };
        GroupDurationSubscriber.prototype._error = function (err) {
            var group = this.group;
            if (!group.closed) {
                group.error(err);
            }
            this.parent.removeGroup(this.key);
        };
        GroupDurationSubscriber.prototype._complete = function () {
            var group = this.group;
            if (!group.closed) {
                group.complete();
            }
            this.parent.removeGroup(this.key);
        };
        return GroupDurationSubscriber;
    }(Subscriber_25.Subscriber));
    var GroupedObservable = (function (_super) {
        __extends(GroupedObservable, _super);
        function GroupedObservable(key, groupSubject, refCountSubscription) {
            var _this = _super.call(this) || this;
            _this.key = key;
            _this.groupSubject = groupSubject;
            _this.refCountSubscription = refCountSubscription;
            return _this;
        }
        GroupedObservable.prototype._subscribe = function (subscriber) {
            var subscription = new Subscription_13.Subscription();
            var _a = this, refCountSubscription = _a.refCountSubscription, groupSubject = _a.groupSubject;
            if (refCountSubscription && !refCountSubscription.closed) {
                subscription.add(new InnerRefCountSubscription(refCountSubscription));
            }
            subscription.add(groupSubject.subscribe(subscriber));
            return subscription;
        };
        return GroupedObservable;
    }(Observable_91.Observable));
    exports.GroupedObservable = GroupedObservable;
    var InnerRefCountSubscription = (function (_super) {
        __extends(InnerRefCountSubscription, _super);
        function InnerRefCountSubscription(parent) {
            var _this = _super.call(this) || this;
            _this.parent = parent;
            parent.count++;
            return _this;
        }
        InnerRefCountSubscription.prototype.unsubscribe = function () {
            var parent = this.parent;
            if (!parent.closed && !this.closed) {
                _super.prototype.unsubscribe.call(this);
                parent.count -= 1;
                if (parent.count === 0 && parent.attemptedToUnsubscribe) {
                    parent.unsubscribe();
                }
            }
        };
        return InnerRefCountSubscription;
    }(Subscription_13.Subscription));
});
define("node_modules/rxjs/src/add/operator/groupBy", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/groupBy"], function (require, exports, Observable_92, groupBy_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_92.Observable.prototype.groupBy = groupBy_1.groupBy;
});
define("node_modules/rxjs/src/operator/ignoreElements", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/noop"], function (require, exports, Subscriber_26, noop_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ignoreElements() {
        return this.lift(new IgnoreElementsOperator());
    }
    exports.ignoreElements = ignoreElements;
    ;
    var IgnoreElementsOperator = (function () {
        function IgnoreElementsOperator() {
        }
        IgnoreElementsOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new IgnoreElementsSubscriber(subscriber));
        };
        return IgnoreElementsOperator;
    }());
    var IgnoreElementsSubscriber = (function (_super) {
        __extends(IgnoreElementsSubscriber, _super);
        function IgnoreElementsSubscriber() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        IgnoreElementsSubscriber.prototype._next = function (unused) {
            noop_2.noop();
        };
        return IgnoreElementsSubscriber;
    }(Subscriber_26.Subscriber));
});
define("node_modules/rxjs/src/add/operator/ignoreElements", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/ignoreElements"], function (require, exports, Observable_93, ignoreElements_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_93.Observable.prototype.ignoreElements = ignoreElements_1.ignoreElements;
});
define("node_modules/rxjs/src/operator/isEmpty", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_27) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function isEmpty() {
        return this.lift(new IsEmptyOperator());
    }
    exports.isEmpty = isEmpty;
    var IsEmptyOperator = (function () {
        function IsEmptyOperator() {
        }
        IsEmptyOperator.prototype.call = function (observer, source) {
            return source.subscribe(new IsEmptySubscriber(observer));
        };
        return IsEmptyOperator;
    }());
    var IsEmptySubscriber = (function (_super) {
        __extends(IsEmptySubscriber, _super);
        function IsEmptySubscriber(destination) {
            return _super.call(this, destination) || this;
        }
        IsEmptySubscriber.prototype.notifyComplete = function (isEmpty) {
            var destination = this.destination;
            destination.next(isEmpty);
            destination.complete();
        };
        IsEmptySubscriber.prototype._next = function (value) {
            this.notifyComplete(false);
        };
        IsEmptySubscriber.prototype._complete = function () {
            this.notifyComplete(true);
        };
        return IsEmptySubscriber;
    }(Subscriber_27.Subscriber));
});
define("node_modules/rxjs/src/add/operator/isEmpty", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/isEmpty"], function (require, exports, Observable_94, isEmpty_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_94.Observable.prototype.isEmpty = isEmpty_1.isEmpty;
});
define("node_modules/rxjs/src/operator/audit", ["require", "exports", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, tryCatch_10, errorObject_11, OuterSubscriber_22, subscribeToResult_22) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function audit(durationSelector) {
        return this.lift(new AuditOperator(durationSelector));
    }
    exports.audit = audit;
    var AuditOperator = (function () {
        function AuditOperator(durationSelector) {
            this.durationSelector = durationSelector;
        }
        AuditOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new AuditSubscriber(subscriber, this.durationSelector));
        };
        return AuditOperator;
    }());
    var AuditSubscriber = (function (_super) {
        __extends(AuditSubscriber, _super);
        function AuditSubscriber(destination, durationSelector) {
            var _this = _super.call(this, destination) || this;
            _this.durationSelector = durationSelector;
            _this.hasValue = false;
            return _this;
        }
        AuditSubscriber.prototype._next = function (value) {
            this.value = value;
            this.hasValue = true;
            if (!this.throttled) {
                var duration = tryCatch_10.tryCatch(this.durationSelector)(value);
                if (duration === errorObject_11.errorObject) {
                    this.destination.error(errorObject_11.errorObject.e);
                }
                else {
                    this.add(this.throttled = subscribeToResult_22.subscribeToResult(this, duration));
                }
            }
        };
        AuditSubscriber.prototype.clearThrottle = function () {
            var _a = this, value = _a.value, hasValue = _a.hasValue, throttled = _a.throttled;
            if (throttled) {
                this.remove(throttled);
                this.throttled = null;
                throttled.unsubscribe();
            }
            if (hasValue) {
                this.value = null;
                this.hasValue = false;
                this.destination.next(value);
            }
        };
        AuditSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex) {
            this.clearThrottle();
        };
        AuditSubscriber.prototype.notifyComplete = function () {
            this.clearThrottle();
        };
        return AuditSubscriber;
    }(OuterSubscriber_22.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/audit", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/audit"], function (require, exports, Observable_95, audit_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_95.Observable.prototype.audit = audit_1.audit;
});
define("node_modules/rxjs/src/operator/auditTime", ["require", "exports", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/Subscriber"], function (require, exports, async_6, Subscriber_28) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function auditTime(duration, scheduler) {
        if (scheduler === void 0) { scheduler = async_6.async; }
        return this.lift(new AuditTimeOperator(duration, scheduler));
    }
    exports.auditTime = auditTime;
    var AuditTimeOperator = (function () {
        function AuditTimeOperator(duration, scheduler) {
            this.duration = duration;
            this.scheduler = scheduler;
        }
        AuditTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new AuditTimeSubscriber(subscriber, this.duration, this.scheduler));
        };
        return AuditTimeOperator;
    }());
    var AuditTimeSubscriber = (function (_super) {
        __extends(AuditTimeSubscriber, _super);
        function AuditTimeSubscriber(destination, duration, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.duration = duration;
            _this.scheduler = scheduler;
            _this.hasValue = false;
            return _this;
        }
        AuditTimeSubscriber.prototype._next = function (value) {
            this.value = value;
            this.hasValue = true;
            if (!this.throttled) {
                this.add(this.throttled = this.scheduler.schedule(dispatchNext, this.duration, this));
            }
        };
        AuditTimeSubscriber.prototype.clearThrottle = function () {
            var _a = this, value = _a.value, hasValue = _a.hasValue, throttled = _a.throttled;
            if (throttled) {
                this.remove(throttled);
                this.throttled = null;
                throttled.unsubscribe();
            }
            if (hasValue) {
                this.value = null;
                this.hasValue = false;
                this.destination.next(value);
            }
        };
        return AuditTimeSubscriber;
    }(Subscriber_28.Subscriber));
    function dispatchNext(subscriber) {
        subscriber.clearThrottle();
    }
});
define("node_modules/rxjs/src/add/operator/auditTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/auditTime"], function (require, exports, Observable_96, auditTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_96.Observable.prototype.auditTime = auditTime_1.auditTime;
});
define("node_modules/rxjs/src/operator/last", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/EmptyError"], function (require, exports, Subscriber_29, EmptyError_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function last(predicate, resultSelector, defaultValue) {
        return this.lift(new LastOperator(predicate, resultSelector, defaultValue, this));
    }
    exports.last = last;
    var LastOperator = (function () {
        function LastOperator(predicate, resultSelector, defaultValue, source) {
            this.predicate = predicate;
            this.resultSelector = resultSelector;
            this.defaultValue = defaultValue;
            this.source = source;
        }
        LastOperator.prototype.call = function (observer, source) {
            return source.subscribe(new LastSubscriber(observer, this.predicate, this.resultSelector, this.defaultValue, this.source));
        };
        return LastOperator;
    }());
    var LastSubscriber = (function (_super) {
        __extends(LastSubscriber, _super);
        function LastSubscriber(destination, predicate, resultSelector, defaultValue, source) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.resultSelector = resultSelector;
            _this.defaultValue = defaultValue;
            _this.source = source;
            _this.hasValue = false;
            _this.index = 0;
            if (typeof defaultValue !== 'undefined') {
                _this.lastValue = defaultValue;
                _this.hasValue = true;
            }
            return _this;
        }
        LastSubscriber.prototype._next = function (value) {
            var index = this.index++;
            if (this.predicate) {
                this._tryPredicate(value, index);
            }
            else {
                if (this.resultSelector) {
                    this._tryResultSelector(value, index);
                    return;
                }
                this.lastValue = value;
                this.hasValue = true;
            }
        };
        LastSubscriber.prototype._tryPredicate = function (value, index) {
            var result;
            try {
                result = this.predicate(value, index, this.source);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            if (result) {
                if (this.resultSelector) {
                    this._tryResultSelector(value, index);
                    return;
                }
                this.lastValue = value;
                this.hasValue = true;
            }
        };
        LastSubscriber.prototype._tryResultSelector = function (value, index) {
            var result;
            try {
                result = this.resultSelector(value, index);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.lastValue = result;
            this.hasValue = true;
        };
        LastSubscriber.prototype._complete = function () {
            var destination = this.destination;
            if (this.hasValue) {
                destination.next(this.lastValue);
                destination.complete();
            }
            else {
                destination.error(new EmptyError_2.EmptyError);
            }
        };
        return LastSubscriber;
    }(Subscriber_29.Subscriber));
});
define("node_modules/rxjs/src/add/operator/last", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/last"], function (require, exports, Observable_97, last_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_97.Observable.prototype.last = last_1.last;
});
define("node_modules/rxjs/src/operator/let", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function letProto(func) {
        return func(this);
    }
    exports.letProto = letProto;
});
define("node_modules/rxjs/src/add/operator/let", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/let"], function (require, exports, Observable_98, let_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_98.Observable.prototype.let = let_1.letProto;
    Observable_98.Observable.prototype.letBind = let_1.letProto;
});
define("node_modules/rxjs/src/operator/every", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_30) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function every(predicate, thisArg) {
        return this.lift(new EveryOperator(predicate, thisArg, this));
    }
    exports.every = every;
    var EveryOperator = (function () {
        function EveryOperator(predicate, thisArg, source) {
            this.predicate = predicate;
            this.thisArg = thisArg;
            this.source = source;
        }
        EveryOperator.prototype.call = function (observer, source) {
            return source.subscribe(new EverySubscriber(observer, this.predicate, this.thisArg, this.source));
        };
        return EveryOperator;
    }());
    var EverySubscriber = (function (_super) {
        __extends(EverySubscriber, _super);
        function EverySubscriber(destination, predicate, thisArg, source) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.thisArg = thisArg;
            _this.source = source;
            _this.index = 0;
            _this.thisArg = thisArg || _this;
            return _this;
        }
        EverySubscriber.prototype.notifyComplete = function (everyValueMatch) {
            this.destination.next(everyValueMatch);
            this.destination.complete();
        };
        EverySubscriber.prototype._next = function (value) {
            var result = false;
            try {
                result = this.predicate.call(this.thisArg, value, this.index++, this.source);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            if (!result) {
                this.notifyComplete(false);
            }
        };
        EverySubscriber.prototype._complete = function () {
            this.notifyComplete(true);
        };
        return EverySubscriber;
    }(Subscriber_30.Subscriber));
});
define("node_modules/rxjs/src/add/operator/every", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/every"], function (require, exports, Observable_99, every_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_99.Observable.prototype.every = every_1.every;
});
define("node_modules/rxjs/src/add/operator/map", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/map"], function (require, exports, Observable_100, map_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_100.Observable.prototype.map = map_2.map;
});
define("node_modules/rxjs/src/operator/mapTo", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_31) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function mapTo(value) {
        return this.lift(new MapToOperator(value));
    }
    exports.mapTo = mapTo;
    var MapToOperator = (function () {
        function MapToOperator(value) {
            this.value = value;
        }
        MapToOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new MapToSubscriber(subscriber, this.value));
        };
        return MapToOperator;
    }());
    var MapToSubscriber = (function (_super) {
        __extends(MapToSubscriber, _super);
        function MapToSubscriber(destination, value) {
            var _this = _super.call(this, destination) || this;
            _this.value = value;
            return _this;
        }
        MapToSubscriber.prototype._next = function (x) {
            this.destination.next(this.value);
        };
        return MapToSubscriber;
    }(Subscriber_31.Subscriber));
});
define("node_modules/rxjs/src/add/operator/mapTo", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/mapTo"], function (require, exports, Observable_101, mapTo_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_101.Observable.prototype.mapTo = mapTo_1.mapTo;
});
define("node_modules/rxjs/src/operator/materialize", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Notification"], function (require, exports, Subscriber_32, Notification_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function materialize() {
        return this.lift(new MaterializeOperator());
    }
    exports.materialize = materialize;
    var MaterializeOperator = (function () {
        function MaterializeOperator() {
        }
        MaterializeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new MaterializeSubscriber(subscriber));
        };
        return MaterializeOperator;
    }());
    var MaterializeSubscriber = (function (_super) {
        __extends(MaterializeSubscriber, _super);
        function MaterializeSubscriber(destination) {
            return _super.call(this, destination) || this;
        }
        MaterializeSubscriber.prototype._next = function (value) {
            this.destination.next(Notification_3.Notification.createNext(value));
        };
        MaterializeSubscriber.prototype._error = function (err) {
            var destination = this.destination;
            destination.next(Notification_3.Notification.createError(err));
            destination.complete();
        };
        MaterializeSubscriber.prototype._complete = function () {
            var destination = this.destination;
            destination.next(Notification_3.Notification.createComplete());
            destination.complete();
        };
        return MaterializeSubscriber;
    }(Subscriber_32.Subscriber));
});
define("node_modules/rxjs/src/add/operator/materialize", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/materialize"], function (require, exports, Observable_102, materialize_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_102.Observable.prototype.materialize = materialize_1.materialize;
});
define("node_modules/rxjs/src/operator/reduce", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_33) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function reduce(accumulator, seed) {
        var hasSeed = false;
        if (arguments.length >= 2) {
            hasSeed = true;
        }
        return this.lift(new ReduceOperator(accumulator, seed, hasSeed));
    }
    exports.reduce = reduce;
    var ReduceOperator = (function () {
        function ReduceOperator(accumulator, seed, hasSeed) {
            if (hasSeed === void 0) { hasSeed = false; }
            this.accumulator = accumulator;
            this.seed = seed;
            this.hasSeed = hasSeed;
        }
        ReduceOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ReduceSubscriber(subscriber, this.accumulator, this.seed, this.hasSeed));
        };
        return ReduceOperator;
    }());
    exports.ReduceOperator = ReduceOperator;
    var ReduceSubscriber = (function (_super) {
        __extends(ReduceSubscriber, _super);
        function ReduceSubscriber(destination, accumulator, seed, hasSeed) {
            var _this = _super.call(this, destination) || this;
            _this.accumulator = accumulator;
            _this.hasSeed = hasSeed;
            _this.index = 0;
            _this.hasValue = false;
            _this.acc = seed;
            if (!_this.hasSeed) {
                _this.index++;
            }
            return _this;
        }
        ReduceSubscriber.prototype._next = function (value) {
            if (this.hasValue || (this.hasValue = this.hasSeed)) {
                this._tryReduce(value);
            }
            else {
                this.acc = value;
                this.hasValue = true;
            }
        };
        ReduceSubscriber.prototype._tryReduce = function (value) {
            var result;
            try {
                result = this.accumulator(this.acc, value, this.index++);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.acc = result;
        };
        ReduceSubscriber.prototype._complete = function () {
            if (this.hasValue || this.hasSeed) {
                this.destination.next(this.acc);
            }
            this.destination.complete();
        };
        return ReduceSubscriber;
    }(Subscriber_33.Subscriber));
    exports.ReduceSubscriber = ReduceSubscriber;
});
define("node_modules/rxjs/src/operator/max", ["require", "exports", "node_modules/rxjs/src/operator/reduce"], function (require, exports, reduce_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function max(comparer) {
        var max = (typeof comparer === 'function')
            ? function (x, y) { return comparer(x, y) > 0 ? x : y; }
            : function (x, y) { return x > y ? x : y; };
        return this.lift(new reduce_1.ReduceOperator(max));
    }
    exports.max = max;
});
define("node_modules/rxjs/src/add/operator/max", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/max"], function (require, exports, Observable_103, max_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_103.Observable.prototype.max = max_1.max;
});
define("node_modules/rxjs/src/add/operator/merge", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/merge"], function (require, exports, Observable_104, merge_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_104.Observable.prototype.merge = merge_3.merge;
});
define("node_modules/rxjs/src/add/operator/mergeAll", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/mergeAll"], function (require, exports, Observable_105, mergeAll_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_105.Observable.prototype.mergeAll = mergeAll_4.mergeAll;
});
define("node_modules/rxjs/src/add/operator/mergeMap", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/mergeMap"], function (require, exports, Observable_106, mergeMap_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_106.Observable.prototype.mergeMap = mergeMap_2.mergeMap;
    Observable_106.Observable.prototype.flatMap = mergeMap_2.mergeMap;
});
define("node_modules/rxjs/src/add/operator/mergeMapTo", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/mergeMapTo"], function (require, exports, Observable_107, mergeMapTo_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_107.Observable.prototype.flatMapTo = mergeMapTo_2.mergeMapTo;
    Observable_107.Observable.prototype.mergeMapTo = mergeMapTo_2.mergeMapTo;
});
define("node_modules/rxjs/src/operator/mergeScan", ["require", "exports", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/util/subscribeToResult", "node_modules/rxjs/src/OuterSubscriber"], function (require, exports, tryCatch_11, errorObject_12, subscribeToResult_23, OuterSubscriber_23) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function mergeScan(accumulator, seed, concurrent) {
        if (concurrent === void 0) { concurrent = Number.POSITIVE_INFINITY; }
        return this.lift(new MergeScanOperator(accumulator, seed, concurrent));
    }
    exports.mergeScan = mergeScan;
    var MergeScanOperator = (function () {
        function MergeScanOperator(accumulator, seed, concurrent) {
            this.accumulator = accumulator;
            this.seed = seed;
            this.concurrent = concurrent;
        }
        MergeScanOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new MergeScanSubscriber(subscriber, this.accumulator, this.seed, this.concurrent));
        };
        return MergeScanOperator;
    }());
    exports.MergeScanOperator = MergeScanOperator;
    var MergeScanSubscriber = (function (_super) {
        __extends(MergeScanSubscriber, _super);
        function MergeScanSubscriber(destination, accumulator, acc, concurrent) {
            var _this = _super.call(this, destination) || this;
            _this.accumulator = accumulator;
            _this.acc = acc;
            _this.concurrent = concurrent;
            _this.hasValue = false;
            _this.hasCompleted = false;
            _this.buffer = [];
            _this.active = 0;
            _this.index = 0;
            return _this;
        }
        MergeScanSubscriber.prototype._next = function (value) {
            if (this.active < this.concurrent) {
                var index = this.index++;
                var ish = tryCatch_11.tryCatch(this.accumulator)(this.acc, value);
                var destination = this.destination;
                if (ish === errorObject_12.errorObject) {
                    destination.error(errorObject_12.errorObject.e);
                }
                else {
                    this.active++;
                    this._innerSub(ish, value, index);
                }
            }
            else {
                this.buffer.push(value);
            }
        };
        MergeScanSubscriber.prototype._innerSub = function (ish, value, index) {
            this.add(subscribeToResult_23.subscribeToResult(this, ish, value, index));
        };
        MergeScanSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.active === 0 && this.buffer.length === 0) {
                if (this.hasValue === false) {
                    this.destination.next(this.acc);
                }
                this.destination.complete();
            }
        };
        MergeScanSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var destination = this.destination;
            this.acc = innerValue;
            this.hasValue = true;
            destination.next(innerValue);
        };
        MergeScanSubscriber.prototype.notifyComplete = function (innerSub) {
            var buffer = this.buffer;
            this.remove(innerSub);
            this.active--;
            if (buffer.length > 0) {
                this._next(buffer.shift());
            }
            else if (this.active === 0 && this.hasCompleted) {
                if (this.hasValue === false) {
                    this.destination.next(this.acc);
                }
                this.destination.complete();
            }
        };
        return MergeScanSubscriber;
    }(OuterSubscriber_23.OuterSubscriber));
    exports.MergeScanSubscriber = MergeScanSubscriber;
});
define("node_modules/rxjs/src/add/operator/mergeScan", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/mergeScan"], function (require, exports, Observable_108, mergeScan_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_108.Observable.prototype.mergeScan = mergeScan_1.mergeScan;
});
define("node_modules/rxjs/src/operator/min", ["require", "exports", "node_modules/rxjs/src/operator/reduce"], function (require, exports, reduce_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function min(comparer) {
        var min = (typeof comparer === 'function')
            ? function (x, y) { return comparer(x, y) < 0 ? x : y; }
            : function (x, y) { return x < y ? x : y; };
        return this.lift(new reduce_2.ReduceOperator(min));
    }
    exports.min = min;
});
define("node_modules/rxjs/src/add/operator/min", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/min"], function (require, exports, Observable_109, min_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_109.Observable.prototype.min = min_1.min;
});
define("node_modules/rxjs/src/observable/ConnectableObservable", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Subscription"], function (require, exports, Subject_6, Observable_110, Subscriber_34, Subscription_14) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ConnectableObservable = (function (_super) {
        __extends(ConnectableObservable, _super);
        function ConnectableObservable(source, subjectFactory) {
            var _this = _super.call(this) || this;
            _this.source = source;
            _this.subjectFactory = subjectFactory;
            _this._refCount = 0;
            return _this;
        }
        ConnectableObservable.prototype._subscribe = function (subscriber) {
            return this.getSubject().subscribe(subscriber);
        };
        ConnectableObservable.prototype.getSubject = function () {
            var subject = this._subject;
            if (!subject || subject.isStopped) {
                this._subject = this.subjectFactory();
            }
            return this._subject;
        };
        ConnectableObservable.prototype.connect = function () {
            var connection = this._connection;
            if (!connection) {
                connection = this._connection = new Subscription_14.Subscription();
                connection.add(this.source
                    .subscribe(new ConnectableSubscriber(this.getSubject(), this)));
                if (connection.closed) {
                    this._connection = null;
                    connection = Subscription_14.Subscription.EMPTY;
                }
                else {
                    this._connection = connection;
                }
            }
            return connection;
        };
        ConnectableObservable.prototype.refCount = function () {
            return this.lift(new RefCountOperator(this));
        };
        return ConnectableObservable;
    }(Observable_110.Observable));
    exports.ConnectableObservable = ConnectableObservable;
    exports.connectableObservableDescriptor = {
        operator: { value: null },
        _refCount: { value: 0, writable: true },
        _subject: { value: null, writable: true },
        _connection: { value: null, writable: true },
        _subscribe: { value: ConnectableObservable.prototype._subscribe },
        getSubject: { value: ConnectableObservable.prototype.getSubject },
        connect: { value: ConnectableObservable.prototype.connect },
        refCount: { value: ConnectableObservable.prototype.refCount }
    };
    var ConnectableSubscriber = (function (_super) {
        __extends(ConnectableSubscriber, _super);
        function ConnectableSubscriber(destination, connectable) {
            var _this = _super.call(this, destination) || this;
            _this.connectable = connectable;
            return _this;
        }
        ConnectableSubscriber.prototype._error = function (err) {
            this._unsubscribe();
            _super.prototype._error.call(this, err);
        };
        ConnectableSubscriber.prototype._complete = function () {
            this._unsubscribe();
            _super.prototype._complete.call(this);
        };
        ConnectableSubscriber.prototype._unsubscribe = function () {
            var connectable = this.connectable;
            if (connectable) {
                this.connectable = null;
                var connection = connectable._connection;
                connectable._refCount = 0;
                connectable._subject = null;
                connectable._connection = null;
                if (connection) {
                    connection.unsubscribe();
                }
            }
        };
        return ConnectableSubscriber;
    }(Subject_6.SubjectSubscriber));
    var RefCountOperator = (function () {
        function RefCountOperator(connectable) {
            this.connectable = connectable;
        }
        RefCountOperator.prototype.call = function (subscriber, source) {
            var connectable = this.connectable;
            connectable._refCount++;
            var refCounter = new RefCountSubscriber(subscriber, connectable);
            var subscription = source.subscribe(refCounter);
            if (!refCounter.closed) {
                refCounter.connection = connectable.connect();
            }
            return subscription;
        };
        return RefCountOperator;
    }());
    var RefCountSubscriber = (function (_super) {
        __extends(RefCountSubscriber, _super);
        function RefCountSubscriber(destination, connectable) {
            var _this = _super.call(this, destination) || this;
            _this.connectable = connectable;
            return _this;
        }
        RefCountSubscriber.prototype._unsubscribe = function () {
            var connectable = this.connectable;
            if (!connectable) {
                this.connection = null;
                return;
            }
            this.connectable = null;
            var refCount = connectable._refCount;
            if (refCount <= 0) {
                this.connection = null;
                return;
            }
            connectable._refCount = refCount - 1;
            if (refCount > 1) {
                this.connection = null;
                return;
            }
            var connection = this.connection;
            var sharedConnection = connectable._connection;
            this.connection = null;
            if (sharedConnection && (!connection || sharedConnection === connection)) {
                sharedConnection.unsubscribe();
            }
        };
        return RefCountSubscriber;
    }(Subscriber_34.Subscriber));
});
define("node_modules/rxjs/src/operator/multicast", ["require", "exports", "node_modules/rxjs/src/observable/ConnectableObservable"], function (require, exports, ConnectableObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function multicast(subjectOrSubjectFactory, selector) {
        var subjectFactory;
        if (typeof subjectOrSubjectFactory === 'function') {
            subjectFactory = subjectOrSubjectFactory;
        }
        else {
            subjectFactory = function subjectFactory() {
                return subjectOrSubjectFactory;
            };
        }
        if (typeof selector === 'function') {
            return this.lift(new MulticastOperator(subjectFactory, selector));
        }
        var connectable = Object.create(this, ConnectableObservable_1.connectableObservableDescriptor);
        connectable.source = this;
        connectable.subjectFactory = subjectFactory;
        return connectable;
    }
    exports.multicast = multicast;
    var MulticastOperator = (function () {
        function MulticastOperator(subjectFactory, selector) {
            this.subjectFactory = subjectFactory;
            this.selector = selector;
        }
        MulticastOperator.prototype.call = function (subscriber, source) {
            var selector = this.selector;
            var subject = this.subjectFactory();
            var subscription = selector(subject).subscribe(subscriber);
            subscription.add(source.subscribe(subject));
            return subscription;
        };
        return MulticastOperator;
    }());
    exports.MulticastOperator = MulticastOperator;
});
define("node_modules/rxjs/src/add/operator/multicast", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/multicast"], function (require, exports, Observable_111, multicast_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_111.Observable.prototype.multicast = multicast_1.multicast;
});
define("node_modules/rxjs/src/add/operator/observeOn", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/observeOn"], function (require, exports, Observable_112, observeOn_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_112.Observable.prototype.observeOn = observeOn_3.observeOn;
});
define("node_modules/rxjs/src/add/operator/onErrorResumeNext", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/onErrorResumeNext"], function (require, exports, Observable_113, onErrorResumeNext_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_113.Observable.prototype.onErrorResumeNext = onErrorResumeNext_2.onErrorResumeNext;
});
define("node_modules/rxjs/src/operator/pairwise", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_35) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function pairwise() {
        return this.lift(new PairwiseOperator());
    }
    exports.pairwise = pairwise;
    var PairwiseOperator = (function () {
        function PairwiseOperator() {
        }
        PairwiseOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new PairwiseSubscriber(subscriber));
        };
        return PairwiseOperator;
    }());
    var PairwiseSubscriber = (function (_super) {
        __extends(PairwiseSubscriber, _super);
        function PairwiseSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.hasPrev = false;
            return _this;
        }
        PairwiseSubscriber.prototype._next = function (value) {
            if (this.hasPrev) {
                this.destination.next([this.prev, value]);
            }
            else {
                this.hasPrev = true;
            }
            this.prev = value;
        };
        return PairwiseSubscriber;
    }(Subscriber_35.Subscriber));
});
define("node_modules/rxjs/src/add/operator/pairwise", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/pairwise"], function (require, exports, Observable_114, pairwise_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_114.Observable.prototype.pairwise = pairwise_1.pairwise;
});
define("node_modules/rxjs/src/util/not", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function not(pred, thisArg) {
        function notPred() {
            return !(notPred.pred.apply(notPred.thisArg, arguments));
        }
        notPred.pred = pred;
        notPred.thisArg = thisArg;
        return notPred;
    }
    exports.not = not;
});
define("node_modules/rxjs/src/operator/partition", ["require", "exports", "node_modules/rxjs/src/util/not", "node_modules/rxjs/src/operator/filter"], function (require, exports, not_1, filter_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function partition(predicate, thisArg) {
        return [
            filter_2.filter.call(this, predicate, thisArg),
            filter_2.filter.call(this, not_1.not(predicate, thisArg))
        ];
    }
    exports.partition = partition;
});
define("node_modules/rxjs/src/add/operator/partition", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/partition"], function (require, exports, Observable_115, partition_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_115.Observable.prototype.partition = partition_1.partition;
});
define("node_modules/rxjs/src/operator/pluck", ["require", "exports", "node_modules/rxjs/src/operator/map"], function (require, exports, map_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function pluck() {
        var properties = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            properties[_i] = arguments[_i];
        }
        var length = properties.length;
        if (length === 0) {
            throw new Error('list of properties cannot be empty.');
        }
        return map_3.map.call(this, plucker(properties, length));
    }
    exports.pluck = pluck;
    function plucker(props, length) {
        var mapper = function (x) {
            var currentProp = x;
            for (var i = 0; i < length; i++) {
                var p = currentProp[props[i]];
                if (typeof p !== 'undefined') {
                    currentProp = p;
                }
                else {
                    return undefined;
                }
            }
            return currentProp;
        };
        return mapper;
    }
});
define("node_modules/rxjs/src/add/operator/pluck", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/pluck"], function (require, exports, Observable_116, pluck_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_116.Observable.prototype.pluck = pluck_1.pluck;
});
define("node_modules/rxjs/src/operator/publish", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/operator/multicast"], function (require, exports, Subject_7, multicast_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function publish(selector) {
        return selector ? multicast_2.multicast.call(this, function () { return new Subject_7.Subject(); }, selector) :
            multicast_2.multicast.call(this, new Subject_7.Subject());
    }
    exports.publish = publish;
});
define("node_modules/rxjs/src/add/operator/publish", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/publish"], function (require, exports, Observable_117, publish_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_117.Observable.prototype.publish = publish_1.publish;
});
define("node_modules/rxjs/src/operator/publishBehavior", ["require", "exports", "node_modules/rxjs/src/BehaviorSubject", "node_modules/rxjs/src/operator/multicast"], function (require, exports, BehaviorSubject_1, multicast_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function publishBehavior(value) {
        return multicast_3.multicast.call(this, new BehaviorSubject_1.BehaviorSubject(value));
    }
    exports.publishBehavior = publishBehavior;
});
define("node_modules/rxjs/src/add/operator/publishBehavior", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/publishBehavior"], function (require, exports, Observable_118, publishBehavior_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_118.Observable.prototype.publishBehavior = publishBehavior_1.publishBehavior;
});
define("node_modules/rxjs/src/operator/publishReplay", ["require", "exports", "node_modules/rxjs/src/ReplaySubject", "node_modules/rxjs/src/operator/multicast"], function (require, exports, ReplaySubject_2, multicast_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function publishReplay(bufferSize, windowTime, scheduler) {
        if (bufferSize === void 0) { bufferSize = Number.POSITIVE_INFINITY; }
        if (windowTime === void 0) { windowTime = Number.POSITIVE_INFINITY; }
        return multicast_4.multicast.call(this, new ReplaySubject_2.ReplaySubject(bufferSize, windowTime, scheduler));
    }
    exports.publishReplay = publishReplay;
});
define("node_modules/rxjs/src/add/operator/publishReplay", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/publishReplay"], function (require, exports, Observable_119, publishReplay_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_119.Observable.prototype.publishReplay = publishReplay_1.publishReplay;
});
define("node_modules/rxjs/src/operator/publishLast", ["require", "exports", "node_modules/rxjs/src/AsyncSubject", "node_modules/rxjs/src/operator/multicast"], function (require, exports, AsyncSubject_3, multicast_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function publishLast() {
        return multicast_5.multicast.call(this, new AsyncSubject_3.AsyncSubject());
    }
    exports.publishLast = publishLast;
});
define("node_modules/rxjs/src/add/operator/publishLast", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/publishLast"], function (require, exports, Observable_120, publishLast_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_120.Observable.prototype.publishLast = publishLast_1.publishLast;
});
define("node_modules/rxjs/src/add/operator/race", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/race"], function (require, exports, Observable_121, race_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_121.Observable.prototype.race = race_2.race;
});
define("node_modules/rxjs/src/add/operator/reduce", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/reduce"], function (require, exports, Observable_122, reduce_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_122.Observable.prototype.reduce = reduce_3.reduce;
});
define("node_modules/rxjs/src/operator/repeat", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/observable/EmptyObservable"], function (require, exports, Subscriber_36, EmptyObservable_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function repeat(count) {
        if (count === void 0) { count = -1; }
        if (count === 0) {
            return new EmptyObservable_5.EmptyObservable();
        }
        else if (count < 0) {
            return this.lift(new RepeatOperator(-1, this));
        }
        else {
            return this.lift(new RepeatOperator(count - 1, this));
        }
    }
    exports.repeat = repeat;
    var RepeatOperator = (function () {
        function RepeatOperator(count, source) {
            this.count = count;
            this.source = source;
        }
        RepeatOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new RepeatSubscriber(subscriber, this.count, this.source));
        };
        return RepeatOperator;
    }());
    var RepeatSubscriber = (function (_super) {
        __extends(RepeatSubscriber, _super);
        function RepeatSubscriber(destination, count, source) {
            var _this = _super.call(this, destination) || this;
            _this.count = count;
            _this.source = source;
            return _this;
        }
        RepeatSubscriber.prototype.complete = function () {
            if (!this.isStopped) {
                var _a = this, source = _a.source, count = _a.count;
                if (count === 0) {
                    return _super.prototype.complete.call(this);
                }
                else if (count > -1) {
                    this.count = count - 1;
                }
                source.subscribe(this._unsubscribeAndRecycle());
            }
        };
        return RepeatSubscriber;
    }(Subscriber_36.Subscriber));
});
define("node_modules/rxjs/src/add/operator/repeat", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/repeat"], function (require, exports, Observable_123, repeat_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_123.Observable.prototype.repeat = repeat_1.repeat;
});
define("node_modules/rxjs/src/operator/repeatWhen", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subject_8, tryCatch_12, errorObject_13, OuterSubscriber_24, subscribeToResult_24) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function repeatWhen(notifier) {
        return this.lift(new RepeatWhenOperator(notifier));
    }
    exports.repeatWhen = repeatWhen;
    var RepeatWhenOperator = (function () {
        function RepeatWhenOperator(notifier) {
            this.notifier = notifier;
        }
        RepeatWhenOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new RepeatWhenSubscriber(subscriber, this.notifier, source));
        };
        return RepeatWhenOperator;
    }());
    var RepeatWhenSubscriber = (function (_super) {
        __extends(RepeatWhenSubscriber, _super);
        function RepeatWhenSubscriber(destination, notifier, source) {
            var _this = _super.call(this, destination) || this;
            _this.notifier = notifier;
            _this.source = source;
            _this.sourceIsBeingSubscribedTo = true;
            return _this;
        }
        RepeatWhenSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.sourceIsBeingSubscribedTo = true;
            this.source.subscribe(this);
        };
        RepeatWhenSubscriber.prototype.notifyComplete = function (innerSub) {
            if (this.sourceIsBeingSubscribedTo === false) {
                return _super.prototype.complete.call(this);
            }
        };
        RepeatWhenSubscriber.prototype.complete = function () {
            this.sourceIsBeingSubscribedTo = false;
            if (!this.isStopped) {
                if (!this.retries) {
                    this.subscribeToRetries();
                }
                else if (this.retriesSubscription.closed) {
                    return _super.prototype.complete.call(this);
                }
                this._unsubscribeAndRecycle();
                this.notifications.next();
            }
        };
        RepeatWhenSubscriber.prototype._unsubscribe = function () {
            var _a = this, notifications = _a.notifications, retriesSubscription = _a.retriesSubscription;
            if (notifications) {
                notifications.unsubscribe();
                this.notifications = null;
            }
            if (retriesSubscription) {
                retriesSubscription.unsubscribe();
                this.retriesSubscription = null;
            }
            this.retries = null;
        };
        RepeatWhenSubscriber.prototype._unsubscribeAndRecycle = function () {
            var _a = this, notifications = _a.notifications, retries = _a.retries, retriesSubscription = _a.retriesSubscription;
            this.notifications = null;
            this.retries = null;
            this.retriesSubscription = null;
            _super.prototype._unsubscribeAndRecycle.call(this);
            this.notifications = notifications;
            this.retries = retries;
            this.retriesSubscription = retriesSubscription;
            return this;
        };
        RepeatWhenSubscriber.prototype.subscribeToRetries = function () {
            this.notifications = new Subject_8.Subject();
            var retries = tryCatch_12.tryCatch(this.notifier)(this.notifications);
            if (retries === errorObject_13.errorObject) {
                return _super.prototype.complete.call(this);
            }
            this.retries = retries;
            this.retriesSubscription = subscribeToResult_24.subscribeToResult(this, retries);
        };
        return RepeatWhenSubscriber;
    }(OuterSubscriber_24.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/repeatWhen", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/repeatWhen"], function (require, exports, Observable_124, repeatWhen_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_124.Observable.prototype.repeatWhen = repeatWhen_1.repeatWhen;
});
define("node_modules/rxjs/src/operator/retry", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_37) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function retry(count) {
        if (count === void 0) { count = -1; }
        return this.lift(new RetryOperator(count, this));
    }
    exports.retry = retry;
    var RetryOperator = (function () {
        function RetryOperator(count, source) {
            this.count = count;
            this.source = source;
        }
        RetryOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new RetrySubscriber(subscriber, this.count, this.source));
        };
        return RetryOperator;
    }());
    var RetrySubscriber = (function (_super) {
        __extends(RetrySubscriber, _super);
        function RetrySubscriber(destination, count, source) {
            var _this = _super.call(this, destination) || this;
            _this.count = count;
            _this.source = source;
            return _this;
        }
        RetrySubscriber.prototype.error = function (err) {
            if (!this.isStopped) {
                var _a = this, source = _a.source, count = _a.count;
                if (count === 0) {
                    return _super.prototype.error.call(this, err);
                }
                else if (count > -1) {
                    this.count = count - 1;
                }
                source.subscribe(this._unsubscribeAndRecycle());
            }
        };
        return RetrySubscriber;
    }(Subscriber_37.Subscriber));
});
define("node_modules/rxjs/src/add/operator/retry", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/retry"], function (require, exports, Observable_125, retry_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_125.Observable.prototype.retry = retry_1.retry;
});
define("node_modules/rxjs/src/operator/retryWhen", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subject_9, tryCatch_13, errorObject_14, OuterSubscriber_25, subscribeToResult_25) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function retryWhen(notifier) {
        return this.lift(new RetryWhenOperator(notifier, this));
    }
    exports.retryWhen = retryWhen;
    var RetryWhenOperator = (function () {
        function RetryWhenOperator(notifier, source) {
            this.notifier = notifier;
            this.source = source;
        }
        RetryWhenOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new RetryWhenSubscriber(subscriber, this.notifier, this.source));
        };
        return RetryWhenOperator;
    }());
    var RetryWhenSubscriber = (function (_super) {
        __extends(RetryWhenSubscriber, _super);
        function RetryWhenSubscriber(destination, notifier, source) {
            var _this = _super.call(this, destination) || this;
            _this.notifier = notifier;
            _this.source = source;
            return _this;
        }
        RetryWhenSubscriber.prototype.error = function (err) {
            if (!this.isStopped) {
                var errors = this.errors;
                var retries = this.retries;
                var retriesSubscription = this.retriesSubscription;
                if (!retries) {
                    errors = new Subject_9.Subject();
                    retries = tryCatch_13.tryCatch(this.notifier)(errors);
                    if (retries === errorObject_14.errorObject) {
                        return _super.prototype.error.call(this, errorObject_14.errorObject.e);
                    }
                    retriesSubscription = subscribeToResult_25.subscribeToResult(this, retries);
                }
                else {
                    this.errors = null;
                    this.retriesSubscription = null;
                }
                this._unsubscribeAndRecycle();
                this.errors = errors;
                this.retries = retries;
                this.retriesSubscription = retriesSubscription;
                errors.next(err);
            }
        };
        RetryWhenSubscriber.prototype._unsubscribe = function () {
            var _a = this, errors = _a.errors, retriesSubscription = _a.retriesSubscription;
            if (errors) {
                errors.unsubscribe();
                this.errors = null;
            }
            if (retriesSubscription) {
                retriesSubscription.unsubscribe();
                this.retriesSubscription = null;
            }
            this.retries = null;
        };
        RetryWhenSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var _a = this, errors = _a.errors, retries = _a.retries, retriesSubscription = _a.retriesSubscription;
            this.errors = null;
            this.retries = null;
            this.retriesSubscription = null;
            this._unsubscribeAndRecycle();
            this.errors = errors;
            this.retries = retries;
            this.retriesSubscription = retriesSubscription;
            this.source.subscribe(this);
        };
        return RetryWhenSubscriber;
    }(OuterSubscriber_25.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/retryWhen", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/retryWhen"], function (require, exports, Observable_126, retryWhen_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_126.Observable.prototype.retryWhen = retryWhen_1.retryWhen;
});
define("node_modules/rxjs/src/operator/sample", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_26, subscribeToResult_26) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function sample(notifier) {
        return this.lift(new SampleOperator(notifier));
    }
    exports.sample = sample;
    var SampleOperator = (function () {
        function SampleOperator(notifier) {
            this.notifier = notifier;
        }
        SampleOperator.prototype.call = function (subscriber, source) {
            var sampleSubscriber = new SampleSubscriber(subscriber);
            var subscription = source.subscribe(sampleSubscriber);
            subscription.add(subscribeToResult_26.subscribeToResult(sampleSubscriber, this.notifier));
            return subscription;
        };
        return SampleOperator;
    }());
    var SampleSubscriber = (function (_super) {
        __extends(SampleSubscriber, _super);
        function SampleSubscriber() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.hasValue = false;
            return _this;
        }
        SampleSubscriber.prototype._next = function (value) {
            this.value = value;
            this.hasValue = true;
        };
        SampleSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.emitValue();
        };
        SampleSubscriber.prototype.notifyComplete = function () {
            this.emitValue();
        };
        SampleSubscriber.prototype.emitValue = function () {
            if (this.hasValue) {
                this.hasValue = false;
                this.destination.next(this.value);
            }
        };
        return SampleSubscriber;
    }(OuterSubscriber_26.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/sample", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/sample"], function (require, exports, Observable_127, sample_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_127.Observable.prototype.sample = sample_1.sample;
});
define("node_modules/rxjs/src/operator/sampleTime", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/scheduler/async"], function (require, exports, Subscriber_38, async_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function sampleTime(period, scheduler) {
        if (scheduler === void 0) { scheduler = async_7.async; }
        return this.lift(new SampleTimeOperator(period, scheduler));
    }
    exports.sampleTime = sampleTime;
    var SampleTimeOperator = (function () {
        function SampleTimeOperator(period, scheduler) {
            this.period = period;
            this.scheduler = scheduler;
        }
        SampleTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SampleTimeSubscriber(subscriber, this.period, this.scheduler));
        };
        return SampleTimeOperator;
    }());
    var SampleTimeSubscriber = (function (_super) {
        __extends(SampleTimeSubscriber, _super);
        function SampleTimeSubscriber(destination, period, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.period = period;
            _this.scheduler = scheduler;
            _this.hasValue = false;
            _this.add(scheduler.schedule(dispatchNotification, period, { subscriber: _this, period: period }));
            return _this;
        }
        SampleTimeSubscriber.prototype._next = function (value) {
            this.lastValue = value;
            this.hasValue = true;
        };
        SampleTimeSubscriber.prototype.notifyNext = function () {
            if (this.hasValue) {
                this.hasValue = false;
                this.destination.next(this.lastValue);
            }
        };
        return SampleTimeSubscriber;
    }(Subscriber_38.Subscriber));
    function dispatchNotification(state) {
        var subscriber = state.subscriber, period = state.period;
        subscriber.notifyNext();
        this.schedule(state, period);
    }
});
define("node_modules/rxjs/src/add/operator/sampleTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/sampleTime"], function (require, exports, Observable_128, sampleTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_128.Observable.prototype.sampleTime = sampleTime_1.sampleTime;
});
define("node_modules/rxjs/src/operator/scan", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_39) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function scan(accumulator, seed) {
        var hasSeed = false;
        if (arguments.length >= 2) {
            hasSeed = true;
        }
        return this.lift(new ScanOperator(accumulator, seed, hasSeed));
    }
    exports.scan = scan;
    var ScanOperator = (function () {
        function ScanOperator(accumulator, seed, hasSeed) {
            if (hasSeed === void 0) { hasSeed = false; }
            this.accumulator = accumulator;
            this.seed = seed;
            this.hasSeed = hasSeed;
        }
        ScanOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ScanSubscriber(subscriber, this.accumulator, this.seed, this.hasSeed));
        };
        return ScanOperator;
    }());
    var ScanSubscriber = (function (_super) {
        __extends(ScanSubscriber, _super);
        function ScanSubscriber(destination, accumulator, _seed, hasSeed) {
            var _this = _super.call(this, destination) || this;
            _this.accumulator = accumulator;
            _this._seed = _seed;
            _this.hasSeed = hasSeed;
            _this.index = 0;
            return _this;
        }
        Object.defineProperty(ScanSubscriber.prototype, "seed", {
            get: function () {
                return this._seed;
            },
            set: function (value) {
                this.hasSeed = true;
                this._seed = value;
            },
            enumerable: true,
            configurable: true
        });
        ScanSubscriber.prototype._next = function (value) {
            if (!this.hasSeed) {
                this.seed = value;
                this.destination.next(value);
            }
            else {
                return this._tryNext(value);
            }
        };
        ScanSubscriber.prototype._tryNext = function (value) {
            var index = this.index++;
            var result;
            try {
                result = this.accumulator(this.seed, value, index);
            }
            catch (err) {
                this.destination.error(err);
            }
            this.seed = result;
            this.destination.next(result);
        };
        return ScanSubscriber;
    }(Subscriber_39.Subscriber));
});
define("node_modules/rxjs/src/add/operator/scan", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/scan"], function (require, exports, Observable_129, scan_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_129.Observable.prototype.scan = scan_1.scan;
});
define("node_modules/rxjs/src/operator/sequenceEqual", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject"], function (require, exports, Subscriber_40, tryCatch_14, errorObject_15) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function sequenceEqual(compareTo, comparor) {
        return this.lift(new SequenceEqualOperator(compareTo, comparor));
    }
    exports.sequenceEqual = sequenceEqual;
    var SequenceEqualOperator = (function () {
        function SequenceEqualOperator(compareTo, comparor) {
            this.compareTo = compareTo;
            this.comparor = comparor;
        }
        SequenceEqualOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SequenceEqualSubscriber(subscriber, this.compareTo, this.comparor));
        };
        return SequenceEqualOperator;
    }());
    exports.SequenceEqualOperator = SequenceEqualOperator;
    var SequenceEqualSubscriber = (function (_super) {
        __extends(SequenceEqualSubscriber, _super);
        function SequenceEqualSubscriber(destination, compareTo, comparor) {
            var _this = _super.call(this, destination) || this;
            _this.compareTo = compareTo;
            _this.comparor = comparor;
            _this._a = [];
            _this._b = [];
            _this._oneComplete = false;
            _this.add(compareTo.subscribe(new SequenceEqualCompareToSubscriber(destination, _this)));
            return _this;
        }
        SequenceEqualSubscriber.prototype._next = function (value) {
            if (this._oneComplete && this._b.length === 0) {
                this.emit(false);
            }
            else {
                this._a.push(value);
                this.checkValues();
            }
        };
        SequenceEqualSubscriber.prototype._complete = function () {
            if (this._oneComplete) {
                this.emit(this._a.length === 0 && this._b.length === 0);
            }
            else {
                this._oneComplete = true;
            }
        };
        SequenceEqualSubscriber.prototype.checkValues = function () {
            var _c = this, _a = _c._a, _b = _c._b, comparor = _c.comparor;
            while (_a.length > 0 && _b.length > 0) {
                var a = _a.shift();
                var b = _b.shift();
                var areEqual = false;
                if (comparor) {
                    areEqual = tryCatch_14.tryCatch(comparor)(a, b);
                    if (areEqual === errorObject_15.errorObject) {
                        this.destination.error(errorObject_15.errorObject.e);
                    }
                }
                else {
                    areEqual = a === b;
                }
                if (!areEqual) {
                    this.emit(false);
                }
            }
        };
        SequenceEqualSubscriber.prototype.emit = function (value) {
            var destination = this.destination;
            destination.next(value);
            destination.complete();
        };
        SequenceEqualSubscriber.prototype.nextB = function (value) {
            if (this._oneComplete && this._a.length === 0) {
                this.emit(false);
            }
            else {
                this._b.push(value);
                this.checkValues();
            }
        };
        return SequenceEqualSubscriber;
    }(Subscriber_40.Subscriber));
    exports.SequenceEqualSubscriber = SequenceEqualSubscriber;
    var SequenceEqualCompareToSubscriber = (function (_super) {
        __extends(SequenceEqualCompareToSubscriber, _super);
        function SequenceEqualCompareToSubscriber(destination, parent) {
            var _this = _super.call(this, destination) || this;
            _this.parent = parent;
            return _this;
        }
        SequenceEqualCompareToSubscriber.prototype._next = function (value) {
            this.parent.nextB(value);
        };
        SequenceEqualCompareToSubscriber.prototype._error = function (err) {
            this.parent.error(err);
        };
        SequenceEqualCompareToSubscriber.prototype._complete = function () {
            this.parent._complete();
        };
        return SequenceEqualCompareToSubscriber;
    }(Subscriber_40.Subscriber));
});
define("node_modules/rxjs/src/add/operator/sequenceEqual", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/sequenceEqual"], function (require, exports, Observable_130, sequenceEqual_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_130.Observable.prototype.sequenceEqual = sequenceEqual_1.sequenceEqual;
});
define("node_modules/rxjs/src/operator/share", ["require", "exports", "node_modules/rxjs/src/operator/multicast", "node_modules/rxjs/src/Subject"], function (require, exports, multicast_6, Subject_10) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function shareSubjectFactory() {
        return new Subject_10.Subject();
    }
    function share() {
        return multicast_6.multicast.call(this, shareSubjectFactory).refCount();
    }
    exports.share = share;
    ;
});
define("node_modules/rxjs/src/add/operator/share", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/share"], function (require, exports, Observable_131, share_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_131.Observable.prototype.share = share_1.share;
});
define("node_modules/rxjs/src/operator/single", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/EmptyError"], function (require, exports, Subscriber_41, EmptyError_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function single(predicate) {
        return this.lift(new SingleOperator(predicate, this));
    }
    exports.single = single;
    var SingleOperator = (function () {
        function SingleOperator(predicate, source) {
            this.predicate = predicate;
            this.source = source;
        }
        SingleOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SingleSubscriber(subscriber, this.predicate, this.source));
        };
        return SingleOperator;
    }());
    var SingleSubscriber = (function (_super) {
        __extends(SingleSubscriber, _super);
        function SingleSubscriber(destination, predicate, source) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.source = source;
            _this.seenValue = false;
            _this.index = 0;
            return _this;
        }
        SingleSubscriber.prototype.applySingleValue = function (value) {
            if (this.seenValue) {
                this.destination.error('Sequence contains more than one element');
            }
            else {
                this.seenValue = true;
                this.singleValue = value;
            }
        };
        SingleSubscriber.prototype._next = function (value) {
            var index = this.index++;
            if (this.predicate) {
                this.tryNext(value, index);
            }
            else {
                this.applySingleValue(value);
            }
        };
        SingleSubscriber.prototype.tryNext = function (value, index) {
            try {
                if (this.predicate(value, index, this.source)) {
                    this.applySingleValue(value);
                }
            }
            catch (err) {
                this.destination.error(err);
            }
        };
        SingleSubscriber.prototype._complete = function () {
            var destination = this.destination;
            if (this.index > 0) {
                destination.next(this.seenValue ? this.singleValue : undefined);
                destination.complete();
            }
            else {
                destination.error(new EmptyError_3.EmptyError);
            }
        };
        return SingleSubscriber;
    }(Subscriber_41.Subscriber));
});
define("node_modules/rxjs/src/add/operator/single", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/single"], function (require, exports, Observable_132, single_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_132.Observable.prototype.single = single_1.single;
});
define("node_modules/rxjs/src/operator/skip", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_42) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function skip(count) {
        return this.lift(new SkipOperator(count));
    }
    exports.skip = skip;
    var SkipOperator = (function () {
        function SkipOperator(total) {
            this.total = total;
        }
        SkipOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SkipSubscriber(subscriber, this.total));
        };
        return SkipOperator;
    }());
    var SkipSubscriber = (function (_super) {
        __extends(SkipSubscriber, _super);
        function SkipSubscriber(destination, total) {
            var _this = _super.call(this, destination) || this;
            _this.total = total;
            _this.count = 0;
            return _this;
        }
        SkipSubscriber.prototype._next = function (x) {
            if (++this.count > this.total) {
                this.destination.next(x);
            }
        };
        return SkipSubscriber;
    }(Subscriber_42.Subscriber));
});
define("node_modules/rxjs/src/add/operator/skip", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/skip"], function (require, exports, Observable_133, skip_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_133.Observable.prototype.skip = skip_1.skip;
});
define("node_modules/rxjs/src/operator/skipUntil", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_27, subscribeToResult_27) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function skipUntil(notifier) {
        return this.lift(new SkipUntilOperator(notifier));
    }
    exports.skipUntil = skipUntil;
    var SkipUntilOperator = (function () {
        function SkipUntilOperator(notifier) {
            this.notifier = notifier;
        }
        SkipUntilOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SkipUntilSubscriber(subscriber, this.notifier));
        };
        return SkipUntilOperator;
    }());
    var SkipUntilSubscriber = (function (_super) {
        __extends(SkipUntilSubscriber, _super);
        function SkipUntilSubscriber(destination, notifier) {
            var _this = _super.call(this, destination) || this;
            _this.hasValue = false;
            _this.isInnerStopped = false;
            _this.add(subscribeToResult_27.subscribeToResult(_this, notifier));
            return _this;
        }
        SkipUntilSubscriber.prototype._next = function (value) {
            if (this.hasValue) {
                _super.prototype._next.call(this, value);
            }
        };
        SkipUntilSubscriber.prototype._complete = function () {
            if (this.isInnerStopped) {
                _super.prototype._complete.call(this);
            }
            else {
                this.unsubscribe();
            }
        };
        SkipUntilSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.hasValue = true;
        };
        SkipUntilSubscriber.prototype.notifyComplete = function () {
            this.isInnerStopped = true;
            if (this.isStopped) {
                _super.prototype._complete.call(this);
            }
        };
        return SkipUntilSubscriber;
    }(OuterSubscriber_27.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/skipUntil", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/skipUntil"], function (require, exports, Observable_134, skipUntil_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_134.Observable.prototype.skipUntil = skipUntil_1.skipUntil;
});
define("node_modules/rxjs/src/operator/skipWhile", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_43) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function skipWhile(predicate) {
        return this.lift(new SkipWhileOperator(predicate));
    }
    exports.skipWhile = skipWhile;
    var SkipWhileOperator = (function () {
        function SkipWhileOperator(predicate) {
            this.predicate = predicate;
        }
        SkipWhileOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SkipWhileSubscriber(subscriber, this.predicate));
        };
        return SkipWhileOperator;
    }());
    var SkipWhileSubscriber = (function (_super) {
        __extends(SkipWhileSubscriber, _super);
        function SkipWhileSubscriber(destination, predicate) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.skipping = true;
            _this.index = 0;
            return _this;
        }
        SkipWhileSubscriber.prototype._next = function (value) {
            var destination = this.destination;
            if (this.skipping) {
                this.tryCallPredicate(value);
            }
            if (!this.skipping) {
                destination.next(value);
            }
        };
        SkipWhileSubscriber.prototype.tryCallPredicate = function (value) {
            try {
                var result = this.predicate(value, this.index++);
                this.skipping = Boolean(result);
            }
            catch (err) {
                this.destination.error(err);
            }
        };
        return SkipWhileSubscriber;
    }(Subscriber_43.Subscriber));
});
define("node_modules/rxjs/src/add/operator/skipWhile", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/skipWhile"], function (require, exports, Observable_135, skipWhile_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_135.Observable.prototype.skipWhile = skipWhile_1.skipWhile;
});
define("node_modules/rxjs/src/operator/startWith", ["require", "exports", "node_modules/rxjs/src/observable/ArrayObservable", "node_modules/rxjs/src/observable/ScalarObservable", "node_modules/rxjs/src/observable/EmptyObservable", "node_modules/rxjs/src/operator/concat", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, ArrayObservable_9, ScalarObservable_3, EmptyObservable_6, concat_4, isScheduler_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function startWith() {
        var array = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            array[_i] = arguments[_i];
        }
        var scheduler = array[array.length - 1];
        if (isScheduler_8.isScheduler(scheduler)) {
            array.pop();
        }
        else {
            scheduler = null;
        }
        var len = array.length;
        if (len === 1) {
            return concat_4.concatStatic(new ScalarObservable_3.ScalarObservable(array[0], scheduler), this);
        }
        else if (len > 1) {
            return concat_4.concatStatic(new ArrayObservable_9.ArrayObservable(array, scheduler), this);
        }
        else {
            return concat_4.concatStatic(new EmptyObservable_6.EmptyObservable(scheduler), this);
        }
    }
    exports.startWith = startWith;
});
define("node_modules/rxjs/src/add/operator/startWith", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/startWith"], function (require, exports, Observable_136, startWith_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_136.Observable.prototype.startWith = startWith_1.startWith;
});
define("node_modules/rxjs/src/util/Immediate", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_14) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ImmediateDefinition = (function () {
        function ImmediateDefinition(root) {
            this.root = root;
            if (root.setImmediate && typeof root.setImmediate === 'function') {
                this.setImmediate = root.setImmediate.bind(root);
                this.clearImmediate = root.clearImmediate.bind(root);
            }
            else {
                this.nextHandle = 1;
                this.tasksByHandle = {};
                this.currentlyRunningATask = false;
                if (this.canUseProcessNextTick()) {
                    this.setImmediate = this.createProcessNextTickSetImmediate();
                }
                else if (this.canUsePostMessage()) {
                    this.setImmediate = this.createPostMessageSetImmediate();
                }
                else if (this.canUseMessageChannel()) {
                    this.setImmediate = this.createMessageChannelSetImmediate();
                }
                else if (this.canUseReadyStateChange()) {
                    this.setImmediate = this.createReadyStateChangeSetImmediate();
                }
                else {
                    this.setImmediate = this.createSetTimeoutSetImmediate();
                }
                var ci = function clearImmediate(handle) {
                    delete clearImmediate.instance.tasksByHandle[handle];
                };
                ci.instance = this;
                this.clearImmediate = ci;
            }
        }
        ImmediateDefinition.prototype.identify = function (o) {
            return this.root.Object.prototype.toString.call(o);
        };
        ImmediateDefinition.prototype.canUseProcessNextTick = function () {
            return this.identify(this.root.process) === '[object process]';
        };
        ImmediateDefinition.prototype.canUseMessageChannel = function () {
            return Boolean(this.root.MessageChannel);
        };
        ImmediateDefinition.prototype.canUseReadyStateChange = function () {
            var document = this.root.document;
            return Boolean(document && 'onreadystatechange' in document.createElement('script'));
        };
        ImmediateDefinition.prototype.canUsePostMessage = function () {
            var root = this.root;
            if (root.postMessage && !root.importScripts) {
                var postMessageIsAsynchronous_1 = true;
                var oldOnMessage = root.onmessage;
                root.onmessage = function () {
                    postMessageIsAsynchronous_1 = false;
                };
                root.postMessage('', '*');
                root.onmessage = oldOnMessage;
                return postMessageIsAsynchronous_1;
            }
            return false;
        };
        ImmediateDefinition.prototype.partiallyApplied = function (handler) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var fn = function result() {
                var _a = result, handler = _a.handler, args = _a.args;
                if (typeof handler === 'function') {
                    handler.apply(undefined, args);
                }
                else {
                    (new Function('' + handler))();
                }
            };
            fn.handler = handler;
            fn.args = args;
            return fn;
        };
        ImmediateDefinition.prototype.addFromSetImmediateArguments = function (args) {
            this.tasksByHandle[this.nextHandle] = this.partiallyApplied.apply(undefined, args);
            return this.nextHandle++;
        };
        ImmediateDefinition.prototype.createProcessNextTickSetImmediate = function () {
            var fn = function setImmediate() {
                var instance = setImmediate.instance;
                var handle = instance.addFromSetImmediateArguments(arguments);
                instance.root.process.nextTick(instance.partiallyApplied(instance.runIfPresent, handle));
                return handle;
            };
            fn.instance = this;
            return fn;
        };
        ImmediateDefinition.prototype.createPostMessageSetImmediate = function () {
            var root = this.root;
            var messagePrefix = 'setImmediate$' + root.Math.random() + '$';
            var onGlobalMessage = function globalMessageHandler(event) {
                var instance = globalMessageHandler.instance;
                if (event.source === root &&
                    typeof event.data === 'string' &&
                    event.data.indexOf(messagePrefix) === 0) {
                    instance.runIfPresent(+event.data.slice(messagePrefix.length));
                }
            };
            onGlobalMessage.instance = this;
            root.addEventListener('message', onGlobalMessage, false);
            var fn = function setImmediate() {
                var _a = setImmediate, messagePrefix = _a.messagePrefix, instance = _a.instance;
                var handle = instance.addFromSetImmediateArguments(arguments);
                instance.root.postMessage(messagePrefix + handle, '*');
                return handle;
            };
            fn.instance = this;
            fn.messagePrefix = messagePrefix;
            return fn;
        };
        ImmediateDefinition.prototype.runIfPresent = function (handle) {
            if (this.currentlyRunningATask) {
                this.root.setTimeout(this.partiallyApplied(this.runIfPresent, handle), 0);
            }
            else {
                var task = this.tasksByHandle[handle];
                if (task) {
                    this.currentlyRunningATask = true;
                    try {
                        task();
                    }
                    finally {
                        this.clearImmediate(handle);
                        this.currentlyRunningATask = false;
                    }
                }
            }
        };
        ImmediateDefinition.prototype.createMessageChannelSetImmediate = function () {
            var _this = this;
            var channel = new this.root.MessageChannel();
            channel.port1.onmessage = function (event) {
                var handle = event.data;
                _this.runIfPresent(handle);
            };
            var fn = function setImmediate() {
                var _a = setImmediate, channel = _a.channel, instance = _a.instance;
                var handle = instance.addFromSetImmediateArguments(arguments);
                channel.port2.postMessage(handle);
                return handle;
            };
            fn.channel = channel;
            fn.instance = this;
            return fn;
        };
        ImmediateDefinition.prototype.createReadyStateChangeSetImmediate = function () {
            var fn = function setImmediate() {
                var instance = setImmediate.instance;
                var root = instance.root;
                var doc = root.document;
                var html = doc.documentElement;
                var handle = instance.addFromSetImmediateArguments(arguments);
                var script = doc.createElement('script');
                script.onreadystatechange = function () {
                    instance.runIfPresent(handle);
                    script.onreadystatechange = null;
                    html.removeChild(script);
                    script = null;
                };
                html.appendChild(script);
                return handle;
            };
            fn.instance = this;
            return fn;
        };
        ImmediateDefinition.prototype.createSetTimeoutSetImmediate = function () {
            var fn = function setImmediate() {
                var instance = setImmediate.instance;
                var handle = instance.addFromSetImmediateArguments(arguments);
                instance.root.setTimeout(instance.partiallyApplied(instance.runIfPresent, handle), 0);
                return handle;
            };
            fn.instance = this;
            return fn;
        };
        return ImmediateDefinition;
    }());
    exports.ImmediateDefinition = ImmediateDefinition;
    exports.Immediate = new ImmediateDefinition(root_14.root);
});
define("node_modules/rxjs/src/scheduler/AsapScheduler", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncScheduler"], function (require, exports, AsyncScheduler_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AsapScheduler = (function (_super) {
        __extends(AsapScheduler, _super);
        function AsapScheduler() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        AsapScheduler.prototype.flush = function (action) {
            this.active = true;
            this.scheduled = undefined;
            var actions = this.actions;
            var error;
            var index = -1;
            var count = actions.length;
            action = action || actions.shift();
            do {
                if (error = action.execute(action.state, action.delay)) {
                    break;
                }
            } while (++index < count && (action = actions.shift()));
            this.active = false;
            if (error) {
                while (++index < count && (action = actions.shift())) {
                    action.unsubscribe();
                }
                throw error;
            }
        };
        return AsapScheduler;
    }(AsyncScheduler_3.AsyncScheduler));
    exports.AsapScheduler = AsapScheduler;
});
define("node_modules/rxjs/src/scheduler/AsapAction", ["require", "exports", "node_modules/rxjs/src/util/Immediate", "node_modules/rxjs/src/scheduler/AsyncAction"], function (require, exports, Immediate_1, AsyncAction_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AsapAction = (function (_super) {
        __extends(AsapAction, _super);
        function AsapAction(scheduler, work) {
            var _this = _super.call(this, scheduler, work) || this;
            _this.scheduler = scheduler;
            _this.work = work;
            return _this;
        }
        AsapAction.prototype.requestAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if (delay !== null && delay > 0) {
                return _super.prototype.requestAsyncId.call(this, scheduler, id, delay);
            }
            scheduler.actions.push(this);
            return scheduler.scheduled || (scheduler.scheduled = Immediate_1.Immediate.setImmediate(scheduler.flush.bind(scheduler, null)));
        };
        AsapAction.prototype.recycleAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if ((delay !== null && delay > 0) || (delay === null && this.delay > 0)) {
                return _super.prototype.recycleAsyncId.call(this, scheduler, id, delay);
            }
            if (scheduler.actions.length === 0) {
                Immediate_1.Immediate.clearImmediate(id);
                scheduler.scheduled = undefined;
            }
            return undefined;
        };
        return AsapAction;
    }(AsyncAction_3.AsyncAction));
    exports.AsapAction = AsapAction;
});
define("node_modules/rxjs/src/scheduler/asap", ["require", "exports", "node_modules/rxjs/src/scheduler/AsapAction", "node_modules/rxjs/src/scheduler/AsapScheduler"], function (require, exports, AsapAction_1, AsapScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.asap = new AsapScheduler_1.AsapScheduler(AsapAction_1.AsapAction);
});
define("node_modules/rxjs/src/observable/SubscribeOnObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/scheduler/asap", "node_modules/rxjs/src/util/isNumeric"], function (require, exports, Observable_137, asap_1, isNumeric_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SubscribeOnObservable = (function (_super) {
        __extends(SubscribeOnObservable, _super);
        function SubscribeOnObservable(source, delayTime, scheduler) {
            if (delayTime === void 0) { delayTime = 0; }
            if (scheduler === void 0) { scheduler = asap_1.asap; }
            var _this = _super.call(this) || this;
            _this.source = source;
            _this.delayTime = delayTime;
            _this.scheduler = scheduler;
            if (!isNumeric_3.isNumeric(delayTime) || delayTime < 0) {
                _this.delayTime = 0;
            }
            if (!scheduler || typeof scheduler.schedule !== 'function') {
                _this.scheduler = asap_1.asap;
            }
            return _this;
        }
        SubscribeOnObservable.create = function (source, delay, scheduler) {
            if (delay === void 0) { delay = 0; }
            if (scheduler === void 0) { scheduler = asap_1.asap; }
            return new SubscribeOnObservable(source, delay, scheduler);
        };
        SubscribeOnObservable.dispatch = function (arg) {
            var source = arg.source, subscriber = arg.subscriber;
            return this.add(source.subscribe(subscriber));
        };
        SubscribeOnObservable.prototype._subscribe = function (subscriber) {
            var delay = this.delayTime;
            var source = this.source;
            var scheduler = this.scheduler;
            return scheduler.schedule(SubscribeOnObservable.dispatch, delay, {
                source: source, subscriber: subscriber
            });
        };
        return SubscribeOnObservable;
    }(Observable_137.Observable));
    exports.SubscribeOnObservable = SubscribeOnObservable;
});
define("node_modules/rxjs/src/operator/subscribeOn", ["require", "exports", "node_modules/rxjs/src/observable/SubscribeOnObservable"], function (require, exports, SubscribeOnObservable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function subscribeOn(scheduler, delay) {
        if (delay === void 0) { delay = 0; }
        return this.lift(new SubscribeOnOperator(scheduler, delay));
    }
    exports.subscribeOn = subscribeOn;
    var SubscribeOnOperator = (function () {
        function SubscribeOnOperator(scheduler, delay) {
            this.scheduler = scheduler;
            this.delay = delay;
        }
        SubscribeOnOperator.prototype.call = function (subscriber, source) {
            return new SubscribeOnObservable_1.SubscribeOnObservable(source, this.delay, this.scheduler).subscribe(subscriber);
        };
        return SubscribeOnOperator;
    }());
});
define("node_modules/rxjs/src/add/operator/subscribeOn", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/subscribeOn"], function (require, exports, Observable_138, subscribeOn_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_138.Observable.prototype.subscribeOn = subscribeOn_1.subscribeOn;
});
define("node_modules/rxjs/src/operator/switch", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_28, subscribeToResult_28) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function _switch() {
        return this.lift(new SwitchOperator());
    }
    exports._switch = _switch;
    var SwitchOperator = (function () {
        function SwitchOperator() {
        }
        SwitchOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SwitchSubscriber(subscriber));
        };
        return SwitchOperator;
    }());
    var SwitchSubscriber = (function (_super) {
        __extends(SwitchSubscriber, _super);
        function SwitchSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.active = 0;
            _this.hasCompleted = false;
            return _this;
        }
        SwitchSubscriber.prototype._next = function (value) {
            this.unsubscribeInner();
            this.active++;
            this.add(this.innerSubscription = subscribeToResult_28.subscribeToResult(this, value));
        };
        SwitchSubscriber.prototype._complete = function () {
            this.hasCompleted = true;
            if (this.active === 0) {
                this.destination.complete();
            }
        };
        SwitchSubscriber.prototype.unsubscribeInner = function () {
            this.active = this.active > 0 ? this.active - 1 : 0;
            var innerSubscription = this.innerSubscription;
            if (innerSubscription) {
                innerSubscription.unsubscribe();
                this.remove(innerSubscription);
            }
        };
        SwitchSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.destination.next(innerValue);
        };
        SwitchSubscriber.prototype.notifyError = function (err) {
            this.destination.error(err);
        };
        SwitchSubscriber.prototype.notifyComplete = function () {
            this.unsubscribeInner();
            if (this.hasCompleted && this.active === 0) {
                this.destination.complete();
            }
        };
        return SwitchSubscriber;
    }(OuterSubscriber_28.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/switch", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/switch"], function (require, exports, Observable_139, switch_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_139.Observable.prototype.switch = switch_1._switch;
    Observable_139.Observable.prototype._switch = switch_1._switch;
});
define("node_modules/rxjs/src/operator/switchMap", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_29, subscribeToResult_29) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function switchMap(project, resultSelector) {
        return this.lift(new SwitchMapOperator(project, resultSelector));
    }
    exports.switchMap = switchMap;
    var SwitchMapOperator = (function () {
        function SwitchMapOperator(project, resultSelector) {
            this.project = project;
            this.resultSelector = resultSelector;
        }
        SwitchMapOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SwitchMapSubscriber(subscriber, this.project, this.resultSelector));
        };
        return SwitchMapOperator;
    }());
    var SwitchMapSubscriber = (function (_super) {
        __extends(SwitchMapSubscriber, _super);
        function SwitchMapSubscriber(destination, project, resultSelector) {
            var _this = _super.call(this, destination) || this;
            _this.project = project;
            _this.resultSelector = resultSelector;
            _this.index = 0;
            return _this;
        }
        SwitchMapSubscriber.prototype._next = function (value) {
            var result;
            var index = this.index++;
            try {
                result = this.project(value, index);
            }
            catch (error) {
                this.destination.error(error);
                return;
            }
            this._innerSub(result, value, index);
        };
        SwitchMapSubscriber.prototype._innerSub = function (result, value, index) {
            var innerSubscription = this.innerSubscription;
            if (innerSubscription) {
                innerSubscription.unsubscribe();
            }
            this.add(this.innerSubscription = subscribeToResult_29.subscribeToResult(this, result, value, index));
        };
        SwitchMapSubscriber.prototype._complete = function () {
            var innerSubscription = this.innerSubscription;
            if (!innerSubscription || innerSubscription.closed) {
                _super.prototype._complete.call(this);
            }
        };
        SwitchMapSubscriber.prototype._unsubscribe = function () {
            this.innerSubscription = null;
        };
        SwitchMapSubscriber.prototype.notifyComplete = function (innerSub) {
            this.remove(innerSub);
            this.innerSubscription = null;
            if (this.isStopped) {
                _super.prototype._complete.call(this);
            }
        };
        SwitchMapSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            if (this.resultSelector) {
                this._tryNotifyNext(outerValue, innerValue, outerIndex, innerIndex);
            }
            else {
                this.destination.next(innerValue);
            }
        };
        SwitchMapSubscriber.prototype._tryNotifyNext = function (outerValue, innerValue, outerIndex, innerIndex) {
            var result;
            try {
                result = this.resultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        return SwitchMapSubscriber;
    }(OuterSubscriber_29.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/switchMap", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/switchMap"], function (require, exports, Observable_140, switchMap_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_140.Observable.prototype.switchMap = switchMap_1.switchMap;
});
define("node_modules/rxjs/src/operator/switchMapTo", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_30, subscribeToResult_30) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function switchMapTo(innerObservable, resultSelector) {
        return this.lift(new SwitchMapToOperator(innerObservable, resultSelector));
    }
    exports.switchMapTo = switchMapTo;
    var SwitchMapToOperator = (function () {
        function SwitchMapToOperator(observable, resultSelector) {
            this.observable = observable;
            this.resultSelector = resultSelector;
        }
        SwitchMapToOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new SwitchMapToSubscriber(subscriber, this.observable, this.resultSelector));
        };
        return SwitchMapToOperator;
    }());
    var SwitchMapToSubscriber = (function (_super) {
        __extends(SwitchMapToSubscriber, _super);
        function SwitchMapToSubscriber(destination, inner, resultSelector) {
            var _this = _super.call(this, destination) || this;
            _this.inner = inner;
            _this.resultSelector = resultSelector;
            _this.index = 0;
            return _this;
        }
        SwitchMapToSubscriber.prototype._next = function (value) {
            var innerSubscription = this.innerSubscription;
            if (innerSubscription) {
                innerSubscription.unsubscribe();
            }
            this.add(this.innerSubscription = subscribeToResult_30.subscribeToResult(this, this.inner, value, this.index++));
        };
        SwitchMapToSubscriber.prototype._complete = function () {
            var innerSubscription = this.innerSubscription;
            if (!innerSubscription || innerSubscription.closed) {
                _super.prototype._complete.call(this);
            }
        };
        SwitchMapToSubscriber.prototype._unsubscribe = function () {
            this.innerSubscription = null;
        };
        SwitchMapToSubscriber.prototype.notifyComplete = function (innerSub) {
            this.remove(innerSub);
            this.innerSubscription = null;
            if (this.isStopped) {
                _super.prototype._complete.call(this);
            }
        };
        SwitchMapToSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            if (resultSelector) {
                this.tryResultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            else {
                destination.next(innerValue);
            }
        };
        SwitchMapToSubscriber.prototype.tryResultSelector = function (outerValue, innerValue, outerIndex, innerIndex) {
            var _a = this, resultSelector = _a.resultSelector, destination = _a.destination;
            var result;
            try {
                result = resultSelector(outerValue, innerValue, outerIndex, innerIndex);
            }
            catch (err) {
                destination.error(err);
                return;
            }
            destination.next(result);
        };
        return SwitchMapToSubscriber;
    }(OuterSubscriber_30.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/switchMapTo", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/switchMapTo"], function (require, exports, Observable_141, switchMapTo_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_141.Observable.prototype.switchMapTo = switchMapTo_1.switchMapTo;
});
define("node_modules/rxjs/src/operator/take", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/ArgumentOutOfRangeError", "node_modules/rxjs/src/observable/EmptyObservable"], function (require, exports, Subscriber_44, ArgumentOutOfRangeError_2, EmptyObservable_7) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function take(count) {
        if (count === 0) {
            return new EmptyObservable_7.EmptyObservable();
        }
        else {
            return this.lift(new TakeOperator(count));
        }
    }
    exports.take = take;
    var TakeOperator = (function () {
        function TakeOperator(total) {
            this.total = total;
            if (this.total < 0) {
                throw new ArgumentOutOfRangeError_2.ArgumentOutOfRangeError;
            }
        }
        TakeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TakeSubscriber(subscriber, this.total));
        };
        return TakeOperator;
    }());
    var TakeSubscriber = (function (_super) {
        __extends(TakeSubscriber, _super);
        function TakeSubscriber(destination, total) {
            var _this = _super.call(this, destination) || this;
            _this.total = total;
            _this.count = 0;
            return _this;
        }
        TakeSubscriber.prototype._next = function (value) {
            var total = this.total;
            var count = ++this.count;
            if (count <= total) {
                this.destination.next(value);
                if (count === total) {
                    this.destination.complete();
                    this.unsubscribe();
                }
            }
        };
        return TakeSubscriber;
    }(Subscriber_44.Subscriber));
});
define("node_modules/rxjs/src/add/operator/take", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/take"], function (require, exports, Observable_142, take_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_142.Observable.prototype.take = take_1.take;
});
define("node_modules/rxjs/src/operator/takeLast", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/ArgumentOutOfRangeError", "node_modules/rxjs/src/observable/EmptyObservable"], function (require, exports, Subscriber_45, ArgumentOutOfRangeError_3, EmptyObservable_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function takeLast(count) {
        if (count === 0) {
            return new EmptyObservable_8.EmptyObservable();
        }
        else {
            return this.lift(new TakeLastOperator(count));
        }
    }
    exports.takeLast = takeLast;
    var TakeLastOperator = (function () {
        function TakeLastOperator(total) {
            this.total = total;
            if (this.total < 0) {
                throw new ArgumentOutOfRangeError_3.ArgumentOutOfRangeError;
            }
        }
        TakeLastOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TakeLastSubscriber(subscriber, this.total));
        };
        return TakeLastOperator;
    }());
    var TakeLastSubscriber = (function (_super) {
        __extends(TakeLastSubscriber, _super);
        function TakeLastSubscriber(destination, total) {
            var _this = _super.call(this, destination) || this;
            _this.total = total;
            _this.ring = new Array();
            _this.count = 0;
            return _this;
        }
        TakeLastSubscriber.prototype._next = function (value) {
            var ring = this.ring;
            var total = this.total;
            var count = this.count++;
            if (ring.length < total) {
                ring.push(value);
            }
            else {
                var index = count % total;
                ring[index] = value;
            }
        };
        TakeLastSubscriber.prototype._complete = function () {
            var destination = this.destination;
            var count = this.count;
            if (count > 0) {
                var total = this.count >= this.total ? this.total : this.count;
                var ring = this.ring;
                for (var i = 0; i < total; i++) {
                    var idx = (count++) % total;
                    destination.next(ring[idx]);
                }
            }
            destination.complete();
        };
        return TakeLastSubscriber;
    }(Subscriber_45.Subscriber));
});
define("node_modules/rxjs/src/add/operator/takeLast", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/takeLast"], function (require, exports, Observable_143, takeLast_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_143.Observable.prototype.takeLast = takeLast_1.takeLast;
});
define("node_modules/rxjs/src/operator/takeUntil", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_31, subscribeToResult_31) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function takeUntil(notifier) {
        return this.lift(new TakeUntilOperator(notifier));
    }
    exports.takeUntil = takeUntil;
    var TakeUntilOperator = (function () {
        function TakeUntilOperator(notifier) {
            this.notifier = notifier;
        }
        TakeUntilOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TakeUntilSubscriber(subscriber, this.notifier));
        };
        return TakeUntilOperator;
    }());
    var TakeUntilSubscriber = (function (_super) {
        __extends(TakeUntilSubscriber, _super);
        function TakeUntilSubscriber(destination, notifier) {
            var _this = _super.call(this, destination) || this;
            _this.notifier = notifier;
            _this.add(subscribeToResult_31.subscribeToResult(_this, notifier));
            return _this;
        }
        TakeUntilSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.complete();
        };
        TakeUntilSubscriber.prototype.notifyComplete = function () {
        };
        return TakeUntilSubscriber;
    }(OuterSubscriber_31.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/takeUntil", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/takeUntil"], function (require, exports, Observable_144, takeUntil_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_144.Observable.prototype.takeUntil = takeUntil_1.takeUntil;
});
define("node_modules/rxjs/src/operator/takeWhile", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_46) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function takeWhile(predicate) {
        return this.lift(new TakeWhileOperator(predicate));
    }
    exports.takeWhile = takeWhile;
    var TakeWhileOperator = (function () {
        function TakeWhileOperator(predicate) {
            this.predicate = predicate;
        }
        TakeWhileOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TakeWhileSubscriber(subscriber, this.predicate));
        };
        return TakeWhileOperator;
    }());
    var TakeWhileSubscriber = (function (_super) {
        __extends(TakeWhileSubscriber, _super);
        function TakeWhileSubscriber(destination, predicate) {
            var _this = _super.call(this, destination) || this;
            _this.predicate = predicate;
            _this.index = 0;
            return _this;
        }
        TakeWhileSubscriber.prototype._next = function (value) {
            var destination = this.destination;
            var result;
            try {
                result = this.predicate(value, this.index++);
            }
            catch (err) {
                destination.error(err);
                return;
            }
            this.nextOrComplete(value, result);
        };
        TakeWhileSubscriber.prototype.nextOrComplete = function (value, predicateResult) {
            var destination = this.destination;
            if (Boolean(predicateResult)) {
                destination.next(value);
            }
            else {
                destination.complete();
            }
        };
        return TakeWhileSubscriber;
    }(Subscriber_46.Subscriber));
});
define("node_modules/rxjs/src/add/operator/takeWhile", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/takeWhile"], function (require, exports, Observable_145, takeWhile_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_145.Observable.prototype.takeWhile = takeWhile_1.takeWhile;
});
define("node_modules/rxjs/src/operator/throttle", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_32, subscribeToResult_32) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function throttle(durationSelector) {
        return this.lift(new ThrottleOperator(durationSelector));
    }
    exports.throttle = throttle;
    var ThrottleOperator = (function () {
        function ThrottleOperator(durationSelector) {
            this.durationSelector = durationSelector;
        }
        ThrottleOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ThrottleSubscriber(subscriber, this.durationSelector));
        };
        return ThrottleOperator;
    }());
    var ThrottleSubscriber = (function (_super) {
        __extends(ThrottleSubscriber, _super);
        function ThrottleSubscriber(destination, durationSelector) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            _this.durationSelector = durationSelector;
            return _this;
        }
        ThrottleSubscriber.prototype._next = function (value) {
            if (!this.throttled) {
                this.tryDurationSelector(value);
            }
        };
        ThrottleSubscriber.prototype.tryDurationSelector = function (value) {
            var duration = null;
            try {
                duration = this.durationSelector(value);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.emitAndThrottle(value, duration);
        };
        ThrottleSubscriber.prototype.emitAndThrottle = function (value, duration) {
            this.add(this.throttled = subscribeToResult_32.subscribeToResult(this, duration));
            this.destination.next(value);
        };
        ThrottleSubscriber.prototype._unsubscribe = function () {
            var throttled = this.throttled;
            if (throttled) {
                this.remove(throttled);
                this.throttled = null;
                throttled.unsubscribe();
            }
        };
        ThrottleSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this._unsubscribe();
        };
        ThrottleSubscriber.prototype.notifyComplete = function () {
            this._unsubscribe();
        };
        return ThrottleSubscriber;
    }(OuterSubscriber_32.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/throttle", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/throttle"], function (require, exports, Observable_146, throttle_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_146.Observable.prototype.throttle = throttle_1.throttle;
});
define("node_modules/rxjs/src/operator/throttleTime", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/scheduler/async"], function (require, exports, Subscriber_47, async_8) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function throttleTime(duration, scheduler) {
        if (scheduler === void 0) { scheduler = async_8.async; }
        return this.lift(new ThrottleTimeOperator(duration, scheduler));
    }
    exports.throttleTime = throttleTime;
    var ThrottleTimeOperator = (function () {
        function ThrottleTimeOperator(duration, scheduler) {
            this.duration = duration;
            this.scheduler = scheduler;
        }
        ThrottleTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ThrottleTimeSubscriber(subscriber, this.duration, this.scheduler));
        };
        return ThrottleTimeOperator;
    }());
    var ThrottleTimeSubscriber = (function (_super) {
        __extends(ThrottleTimeSubscriber, _super);
        function ThrottleTimeSubscriber(destination, duration, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.duration = duration;
            _this.scheduler = scheduler;
            return _this;
        }
        ThrottleTimeSubscriber.prototype._next = function (value) {
            if (!this.throttled) {
                this.add(this.throttled = this.scheduler.schedule(dispatchNext, this.duration, { subscriber: this }));
                this.destination.next(value);
            }
        };
        ThrottleTimeSubscriber.prototype.clearThrottle = function () {
            var throttled = this.throttled;
            if (throttled) {
                throttled.unsubscribe();
                this.remove(throttled);
                this.throttled = null;
            }
        };
        return ThrottleTimeSubscriber;
    }(Subscriber_47.Subscriber));
    function dispatchNext(arg) {
        var subscriber = arg.subscriber;
        subscriber.clearThrottle();
    }
});
define("node_modules/rxjs/src/add/operator/throttleTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/throttleTime"], function (require, exports, Observable_147, throttleTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_147.Observable.prototype.throttleTime = throttleTime_1.throttleTime;
});
define("node_modules/rxjs/src/operator/timeInterval", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/scheduler/async"], function (require, exports, Subscriber_48, async_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function timeInterval(scheduler) {
        if (scheduler === void 0) { scheduler = async_9.async; }
        return this.lift(new TimeIntervalOperator(scheduler));
    }
    exports.timeInterval = timeInterval;
    var TimeInterval = (function () {
        function TimeInterval(value, interval) {
            this.value = value;
            this.interval = interval;
        }
        return TimeInterval;
    }());
    exports.TimeInterval = TimeInterval;
    ;
    var TimeIntervalOperator = (function () {
        function TimeIntervalOperator(scheduler) {
            this.scheduler = scheduler;
        }
        TimeIntervalOperator.prototype.call = function (observer, source) {
            return source.subscribe(new TimeIntervalSubscriber(observer, this.scheduler));
        };
        return TimeIntervalOperator;
    }());
    var TimeIntervalSubscriber = (function (_super) {
        __extends(TimeIntervalSubscriber, _super);
        function TimeIntervalSubscriber(destination, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.scheduler = scheduler;
            _this.lastTime = 0;
            _this.lastTime = scheduler.now();
            return _this;
        }
        TimeIntervalSubscriber.prototype._next = function (value) {
            var now = this.scheduler.now();
            var span = now - this.lastTime;
            this.lastTime = now;
            this.destination.next(new TimeInterval(value, span));
        };
        return TimeIntervalSubscriber;
    }(Subscriber_48.Subscriber));
});
define("node_modules/rxjs/src/add/operator/timeInterval", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/timeInterval"], function (require, exports, Observable_148, timeInterval_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_148.Observable.prototype.timeInterval = timeInterval_1.timeInterval;
});
define("node_modules/rxjs/src/util/TimeoutError", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var TimeoutError = (function (_super) {
        __extends(TimeoutError, _super);
        function TimeoutError() {
            var _this = this;
            var err = _this = _super.call(this, 'Timeout has occurred') || this;
            _this.name = err.name = 'TimeoutError';
            _this.stack = err.stack;
            _this.message = err.message;
            return _this;
        }
        return TimeoutError;
    }(Error));
    exports.TimeoutError = TimeoutError;
});
define("node_modules/rxjs/src/operator/timeout", ["require", "exports", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/util/isDate", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/TimeoutError"], function (require, exports, async_10, isDate_3, Subscriber_49, TimeoutError_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function timeout(due, scheduler) {
        if (scheduler === void 0) { scheduler = async_10.async; }
        var absoluteTimeout = isDate_3.isDate(due);
        var waitFor = absoluteTimeout ? (+due - scheduler.now()) : Math.abs(due);
        return this.lift(new TimeoutOperator(waitFor, absoluteTimeout, scheduler, new TimeoutError_1.TimeoutError()));
    }
    exports.timeout = timeout;
    var TimeoutOperator = (function () {
        function TimeoutOperator(waitFor, absoluteTimeout, scheduler, errorInstance) {
            this.waitFor = waitFor;
            this.absoluteTimeout = absoluteTimeout;
            this.scheduler = scheduler;
            this.errorInstance = errorInstance;
        }
        TimeoutOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TimeoutSubscriber(subscriber, this.absoluteTimeout, this.waitFor, this.scheduler, this.errorInstance));
        };
        return TimeoutOperator;
    }());
    var TimeoutSubscriber = (function (_super) {
        __extends(TimeoutSubscriber, _super);
        function TimeoutSubscriber(destination, absoluteTimeout, waitFor, scheduler, errorInstance) {
            var _this = _super.call(this, destination) || this;
            _this.absoluteTimeout = absoluteTimeout;
            _this.waitFor = waitFor;
            _this.scheduler = scheduler;
            _this.errorInstance = errorInstance;
            _this.action = null;
            _this.scheduleTimeout();
            return _this;
        }
        TimeoutSubscriber.dispatchTimeout = function (subscriber) {
            subscriber.error(subscriber.errorInstance);
        };
        TimeoutSubscriber.prototype.scheduleTimeout = function () {
            var action = this.action;
            if (action) {
                this.action = action.schedule(this, this.waitFor);
            }
            else {
                this.add(this.action = this.scheduler.schedule(TimeoutSubscriber.dispatchTimeout, this.waitFor, this));
            }
        };
        TimeoutSubscriber.prototype._next = function (value) {
            if (!this.absoluteTimeout) {
                this.scheduleTimeout();
            }
            _super.prototype._next.call(this, value);
        };
        TimeoutSubscriber.prototype._unsubscribe = function () {
            this.action = null;
            this.scheduler = null;
            this.errorInstance = null;
        };
        return TimeoutSubscriber;
    }(Subscriber_49.Subscriber));
});
define("node_modules/rxjs/src/add/operator/timeout", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/timeout"], function (require, exports, Observable_149, timeout_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_149.Observable.prototype.timeout = timeout_1.timeout;
});
define("node_modules/rxjs/src/operator/timeoutWith", ["require", "exports", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/util/isDate", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, async_11, isDate_4, OuterSubscriber_33, subscribeToResult_33) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function timeoutWith(due, withObservable, scheduler) {
        if (scheduler === void 0) { scheduler = async_11.async; }
        var absoluteTimeout = isDate_4.isDate(due);
        var waitFor = absoluteTimeout ? (+due - scheduler.now()) : Math.abs(due);
        return this.lift(new TimeoutWithOperator(waitFor, absoluteTimeout, withObservable, scheduler));
    }
    exports.timeoutWith = timeoutWith;
    var TimeoutWithOperator = (function () {
        function TimeoutWithOperator(waitFor, absoluteTimeout, withObservable, scheduler) {
            this.waitFor = waitFor;
            this.absoluteTimeout = absoluteTimeout;
            this.withObservable = withObservable;
            this.scheduler = scheduler;
        }
        TimeoutWithOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new TimeoutWithSubscriber(subscriber, this.absoluteTimeout, this.waitFor, this.withObservable, this.scheduler));
        };
        return TimeoutWithOperator;
    }());
    var TimeoutWithSubscriber = (function (_super) {
        __extends(TimeoutWithSubscriber, _super);
        function TimeoutWithSubscriber(destination, absoluteTimeout, waitFor, withObservable, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.absoluteTimeout = absoluteTimeout;
            _this.waitFor = waitFor;
            _this.withObservable = withObservable;
            _this.scheduler = scheduler;
            _this.action = null;
            _this.scheduleTimeout();
            return _this;
        }
        TimeoutWithSubscriber.dispatchTimeout = function (subscriber) {
            var withObservable = subscriber.withObservable;
            subscriber._unsubscribeAndRecycle();
            subscriber.add(subscribeToResult_33.subscribeToResult(subscriber, withObservable));
        };
        TimeoutWithSubscriber.prototype.scheduleTimeout = function () {
            var action = this.action;
            if (action) {
                this.action = action.schedule(this, this.waitFor);
            }
            else {
                this.add(this.action = this.scheduler.schedule(TimeoutWithSubscriber.dispatchTimeout, this.waitFor, this));
            }
        };
        TimeoutWithSubscriber.prototype._next = function (value) {
            if (!this.absoluteTimeout) {
                this.scheduleTimeout();
            }
            _super.prototype._next.call(this, value);
        };
        TimeoutWithSubscriber.prototype._unsubscribe = function () {
            this.action = null;
            this.scheduler = null;
            this.withObservable = null;
        };
        return TimeoutWithSubscriber;
    }(OuterSubscriber_33.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/timeoutWith", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/timeoutWith"], function (require, exports, Observable_150, timeoutWith_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_150.Observable.prototype.timeoutWith = timeoutWith_1.timeoutWith;
});
define("node_modules/rxjs/src/operator/timestamp", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/scheduler/async"], function (require, exports, Subscriber_50, async_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function timestamp(scheduler) {
        if (scheduler === void 0) { scheduler = async_12.async; }
        return this.lift(new TimestampOperator(scheduler));
    }
    exports.timestamp = timestamp;
    var Timestamp = (function () {
        function Timestamp(value, timestamp) {
            this.value = value;
            this.timestamp = timestamp;
        }
        return Timestamp;
    }());
    exports.Timestamp = Timestamp;
    ;
    var TimestampOperator = (function () {
        function TimestampOperator(scheduler) {
            this.scheduler = scheduler;
        }
        TimestampOperator.prototype.call = function (observer, source) {
            return source.subscribe(new TimestampSubscriber(observer, this.scheduler));
        };
        return TimestampOperator;
    }());
    var TimestampSubscriber = (function (_super) {
        __extends(TimestampSubscriber, _super);
        function TimestampSubscriber(destination, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.scheduler = scheduler;
            return _this;
        }
        TimestampSubscriber.prototype._next = function (value) {
            var now = this.scheduler.now();
            this.destination.next(new Timestamp(value, now));
        };
        return TimestampSubscriber;
    }(Subscriber_50.Subscriber));
});
define("node_modules/rxjs/src/add/operator/timestamp", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/timestamp"], function (require, exports, Observable_151, timestamp_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_151.Observable.prototype.timestamp = timestamp_1.timestamp;
});
define("node_modules/rxjs/src/operator/toArray", ["require", "exports", "node_modules/rxjs/src/Subscriber"], function (require, exports, Subscriber_51) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function toArray() {
        return this.lift(new ToArrayOperator());
    }
    exports.toArray = toArray;
    var ToArrayOperator = (function () {
        function ToArrayOperator() {
        }
        ToArrayOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new ToArraySubscriber(subscriber));
        };
        return ToArrayOperator;
    }());
    var ToArraySubscriber = (function (_super) {
        __extends(ToArraySubscriber, _super);
        function ToArraySubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.array = [];
            return _this;
        }
        ToArraySubscriber.prototype._next = function (x) {
            this.array.push(x);
        };
        ToArraySubscriber.prototype._complete = function () {
            this.destination.next(this.array);
            this.destination.complete();
        };
        return ToArraySubscriber;
    }(Subscriber_51.Subscriber));
});
define("node_modules/rxjs/src/add/operator/toArray", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/toArray"], function (require, exports, Observable_152, toArray_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_152.Observable.prototype.toArray = toArray_1.toArray;
});
define("node_modules/rxjs/src/operator/toPromise", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_15) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function toPromise(PromiseCtor) {
        var _this = this;
        if (!PromiseCtor) {
            if (root_15.root.Rx && root_15.root.Rx.config && root_15.root.Rx.config.Promise) {
                PromiseCtor = root_15.root.Rx.config.Promise;
            }
            else if (root_15.root.Promise) {
                PromiseCtor = root_15.root.Promise;
            }
        }
        if (!PromiseCtor) {
            throw new Error('no Promise impl found');
        }
        return new PromiseCtor(function (resolve, reject) {
            var value;
            _this.subscribe(function (x) { return value = x; }, function (err) { return reject(err); }, function () { return resolve(value); });
        });
    }
    exports.toPromise = toPromise;
});
define("node_modules/rxjs/src/add/operator/toPromise", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/toPromise"], function (require, exports, Observable_153, toPromise_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_153.Observable.prototype.toPromise = toPromise_1.toPromise;
});
define("node_modules/rxjs/src/operator/window", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subject_11, OuterSubscriber_34, subscribeToResult_34) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function window(windowBoundaries) {
        return this.lift(new WindowOperator(windowBoundaries));
    }
    exports.window = window;
    var WindowOperator = (function () {
        function WindowOperator(windowBoundaries) {
            this.windowBoundaries = windowBoundaries;
        }
        WindowOperator.prototype.call = function (subscriber, source) {
            var windowSubscriber = new WindowSubscriber(subscriber);
            var sourceSubscription = source.subscribe(windowSubscriber);
            if (!sourceSubscription.closed) {
                windowSubscriber.add(subscribeToResult_34.subscribeToResult(windowSubscriber, this.windowBoundaries));
            }
            return sourceSubscription;
        };
        return WindowOperator;
    }());
    var WindowSubscriber = (function (_super) {
        __extends(WindowSubscriber, _super);
        function WindowSubscriber(destination) {
            var _this = _super.call(this, destination) || this;
            _this.window = new Subject_11.Subject();
            destination.next(_this.window);
            return _this;
        }
        WindowSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.openWindow();
        };
        WindowSubscriber.prototype.notifyError = function (error, innerSub) {
            this._error(error);
        };
        WindowSubscriber.prototype.notifyComplete = function (innerSub) {
            this._complete();
        };
        WindowSubscriber.prototype._next = function (value) {
            this.window.next(value);
        };
        WindowSubscriber.prototype._error = function (err) {
            this.window.error(err);
            this.destination.error(err);
        };
        WindowSubscriber.prototype._complete = function () {
            this.window.complete();
            this.destination.complete();
        };
        WindowSubscriber.prototype._unsubscribe = function () {
            this.window = null;
        };
        WindowSubscriber.prototype.openWindow = function () {
            var prevWindow = this.window;
            if (prevWindow) {
                prevWindow.complete();
            }
            var destination = this.destination;
            var newWindow = this.window = new Subject_11.Subject();
            destination.next(newWindow);
        };
        return WindowSubscriber;
    }(OuterSubscriber_34.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/window", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/window"], function (require, exports, Observable_154, window_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_154.Observable.prototype.window = window_1.window;
});
define("node_modules/rxjs/src/operator/windowCount", ["require", "exports", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/Subject"], function (require, exports, Subscriber_52, Subject_12) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function windowCount(windowSize, startWindowEvery) {
        if (startWindowEvery === void 0) { startWindowEvery = 0; }
        return this.lift(new WindowCountOperator(windowSize, startWindowEvery));
    }
    exports.windowCount = windowCount;
    var WindowCountOperator = (function () {
        function WindowCountOperator(windowSize, startWindowEvery) {
            this.windowSize = windowSize;
            this.startWindowEvery = startWindowEvery;
        }
        WindowCountOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new WindowCountSubscriber(subscriber, this.windowSize, this.startWindowEvery));
        };
        return WindowCountOperator;
    }());
    var WindowCountSubscriber = (function (_super) {
        __extends(WindowCountSubscriber, _super);
        function WindowCountSubscriber(destination, windowSize, startWindowEvery) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            _this.windowSize = windowSize;
            _this.startWindowEvery = startWindowEvery;
            _this.windows = [new Subject_12.Subject()];
            _this.count = 0;
            destination.next(_this.windows[0]);
            return _this;
        }
        WindowCountSubscriber.prototype._next = function (value) {
            var startWindowEvery = (this.startWindowEvery > 0) ? this.startWindowEvery : this.windowSize;
            var destination = this.destination;
            var windowSize = this.windowSize;
            var windows = this.windows;
            var len = windows.length;
            for (var i = 0; i < len && !this.closed; i++) {
                windows[i].next(value);
            }
            var c = this.count - windowSize + 1;
            if (c >= 0 && c % startWindowEvery === 0 && !this.closed) {
                windows.shift().complete();
            }
            if (++this.count % startWindowEvery === 0 && !this.closed) {
                var window_2 = new Subject_12.Subject();
                windows.push(window_2);
                destination.next(window_2);
            }
        };
        WindowCountSubscriber.prototype._error = function (err) {
            var windows = this.windows;
            if (windows) {
                while (windows.length > 0 && !this.closed) {
                    windows.shift().error(err);
                }
            }
            this.destination.error(err);
        };
        WindowCountSubscriber.prototype._complete = function () {
            var windows = this.windows;
            if (windows) {
                while (windows.length > 0 && !this.closed) {
                    windows.shift().complete();
                }
            }
            this.destination.complete();
        };
        WindowCountSubscriber.prototype._unsubscribe = function () {
            this.count = 0;
            this.windows = null;
        };
        return WindowCountSubscriber;
    }(Subscriber_52.Subscriber));
});
define("node_modules/rxjs/src/add/operator/windowCount", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/windowCount"], function (require, exports, Observable_155, windowCount_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_155.Observable.prototype.windowCount = windowCount_1.windowCount;
});
define("node_modules/rxjs/src/operator/windowTime", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/util/isNumeric", "node_modules/rxjs/src/util/isScheduler"], function (require, exports, Subject_13, async_13, Subscriber_53, isNumeric_4, isScheduler_9) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function windowTime(windowTimeSpan) {
        var scheduler = async_13.async;
        var windowCreationInterval = null;
        var maxWindowSize = Number.POSITIVE_INFINITY;
        if (isScheduler_9.isScheduler(arguments[3])) {
            scheduler = arguments[3];
        }
        if (isScheduler_9.isScheduler(arguments[2])) {
            scheduler = arguments[2];
        }
        else if (isNumeric_4.isNumeric(arguments[2])) {
            maxWindowSize = arguments[2];
        }
        if (isScheduler_9.isScheduler(arguments[1])) {
            scheduler = arguments[1];
        }
        else if (isNumeric_4.isNumeric(arguments[1])) {
            windowCreationInterval = arguments[1];
        }
        return this.lift(new WindowTimeOperator(windowTimeSpan, windowCreationInterval, maxWindowSize, scheduler));
    }
    exports.windowTime = windowTime;
    var WindowTimeOperator = (function () {
        function WindowTimeOperator(windowTimeSpan, windowCreationInterval, maxWindowSize, scheduler) {
            this.windowTimeSpan = windowTimeSpan;
            this.windowCreationInterval = windowCreationInterval;
            this.maxWindowSize = maxWindowSize;
            this.scheduler = scheduler;
        }
        WindowTimeOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new WindowTimeSubscriber(subscriber, this.windowTimeSpan, this.windowCreationInterval, this.maxWindowSize, this.scheduler));
        };
        return WindowTimeOperator;
    }());
    var CountedSubject = (function (_super) {
        __extends(CountedSubject, _super);
        function CountedSubject() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this._numberOfNextedValues = 0;
            return _this;
        }
        CountedSubject.prototype.next = function (value) {
            this._numberOfNextedValues++;
            _super.prototype.next.call(this, value);
        };
        Object.defineProperty(CountedSubject.prototype, "numberOfNextedValues", {
            get: function () {
                return this._numberOfNextedValues;
            },
            enumerable: true,
            configurable: true
        });
        return CountedSubject;
    }(Subject_13.Subject));
    var WindowTimeSubscriber = (function (_super) {
        __extends(WindowTimeSubscriber, _super);
        function WindowTimeSubscriber(destination, windowTimeSpan, windowCreationInterval, maxWindowSize, scheduler) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            _this.windowTimeSpan = windowTimeSpan;
            _this.windowCreationInterval = windowCreationInterval;
            _this.maxWindowSize = maxWindowSize;
            _this.scheduler = scheduler;
            _this.windows = [];
            var window = _this.openWindow();
            if (windowCreationInterval !== null && windowCreationInterval >= 0) {
                var closeState = { subscriber: _this, window: window, context: null };
                var creationState = { windowTimeSpan: windowTimeSpan, windowCreationInterval: windowCreationInterval, subscriber: _this, scheduler: scheduler };
                _this.add(scheduler.schedule(dispatchWindowClose, windowTimeSpan, closeState));
                _this.add(scheduler.schedule(dispatchWindowCreation, windowCreationInterval, creationState));
            }
            else {
                var timeSpanOnlyState = { subscriber: _this, window: window, windowTimeSpan: windowTimeSpan };
                _this.add(scheduler.schedule(dispatchWindowTimeSpanOnly, windowTimeSpan, timeSpanOnlyState));
            }
            return _this;
        }
        WindowTimeSubscriber.prototype._next = function (value) {
            var windows = this.windows;
            var len = windows.length;
            for (var i = 0; i < len; i++) {
                var window_3 = windows[i];
                if (!window_3.closed) {
                    window_3.next(value);
                    if (window_3.numberOfNextedValues >= this.maxWindowSize) {
                        this.closeWindow(window_3);
                    }
                }
            }
        };
        WindowTimeSubscriber.prototype._error = function (err) {
            var windows = this.windows;
            while (windows.length > 0) {
                windows.shift().error(err);
            }
            this.destination.error(err);
        };
        WindowTimeSubscriber.prototype._complete = function () {
            var windows = this.windows;
            while (windows.length > 0) {
                var window_4 = windows.shift();
                if (!window_4.closed) {
                    window_4.complete();
                }
            }
            this.destination.complete();
        };
        WindowTimeSubscriber.prototype.openWindow = function () {
            var window = new CountedSubject();
            this.windows.push(window);
            var destination = this.destination;
            destination.next(window);
            return window;
        };
        WindowTimeSubscriber.prototype.closeWindow = function (window) {
            window.complete();
            var windows = this.windows;
            windows.splice(windows.indexOf(window), 1);
        };
        return WindowTimeSubscriber;
    }(Subscriber_53.Subscriber));
    function dispatchWindowTimeSpanOnly(state) {
        var subscriber = state.subscriber, windowTimeSpan = state.windowTimeSpan, window = state.window;
        if (window) {
            subscriber.closeWindow(window);
        }
        state.window = subscriber.openWindow();
        this.schedule(state, windowTimeSpan);
    }
    function dispatchWindowCreation(state) {
        var windowTimeSpan = state.windowTimeSpan, subscriber = state.subscriber, scheduler = state.scheduler, windowCreationInterval = state.windowCreationInterval;
        var window = subscriber.openWindow();
        var action = this;
        var context = { action: action, subscription: null };
        var timeSpanState = { subscriber: subscriber, window: window, context: context };
        context.subscription = scheduler.schedule(dispatchWindowClose, windowTimeSpan, timeSpanState);
        action.add(context.subscription);
        action.schedule(state, windowCreationInterval);
    }
    function dispatchWindowClose(state) {
        var subscriber = state.subscriber, window = state.window, context = state.context;
        if (context && context.action && context.subscription) {
            context.action.remove(context.subscription);
        }
        subscriber.closeWindow(window);
    }
});
define("node_modules/rxjs/src/add/operator/windowTime", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/windowTime"], function (require, exports, Observable_156, windowTime_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_156.Observable.prototype.windowTime = windowTime_1.windowTime;
});
define("node_modules/rxjs/src/operator/windowToggle", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subject_14, Subscription_15, tryCatch_15, errorObject_16, OuterSubscriber_35, subscribeToResult_35) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function windowToggle(openings, closingSelector) {
        return this.lift(new WindowToggleOperator(openings, closingSelector));
    }
    exports.windowToggle = windowToggle;
    var WindowToggleOperator = (function () {
        function WindowToggleOperator(openings, closingSelector) {
            this.openings = openings;
            this.closingSelector = closingSelector;
        }
        WindowToggleOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new WindowToggleSubscriber(subscriber, this.openings, this.closingSelector));
        };
        return WindowToggleOperator;
    }());
    var WindowToggleSubscriber = (function (_super) {
        __extends(WindowToggleSubscriber, _super);
        function WindowToggleSubscriber(destination, openings, closingSelector) {
            var _this = _super.call(this, destination) || this;
            _this.openings = openings;
            _this.closingSelector = closingSelector;
            _this.contexts = [];
            _this.add(_this.openSubscription = subscribeToResult_35.subscribeToResult(_this, openings, openings));
            return _this;
        }
        WindowToggleSubscriber.prototype._next = function (value) {
            var contexts = this.contexts;
            if (contexts) {
                var len = contexts.length;
                for (var i = 0; i < len; i++) {
                    contexts[i].window.next(value);
                }
            }
        };
        WindowToggleSubscriber.prototype._error = function (err) {
            var contexts = this.contexts;
            this.contexts = null;
            if (contexts) {
                var len = contexts.length;
                var index = -1;
                while (++index < len) {
                    var context = contexts[index];
                    context.window.error(err);
                    context.subscription.unsubscribe();
                }
            }
            _super.prototype._error.call(this, err);
        };
        WindowToggleSubscriber.prototype._complete = function () {
            var contexts = this.contexts;
            this.contexts = null;
            if (contexts) {
                var len = contexts.length;
                var index = -1;
                while (++index < len) {
                    var context = contexts[index];
                    context.window.complete();
                    context.subscription.unsubscribe();
                }
            }
            _super.prototype._complete.call(this);
        };
        WindowToggleSubscriber.prototype._unsubscribe = function () {
            var contexts = this.contexts;
            this.contexts = null;
            if (contexts) {
                var len = contexts.length;
                var index = -1;
                while (++index < len) {
                    var context = contexts[index];
                    context.window.unsubscribe();
                    context.subscription.unsubscribe();
                }
            }
        };
        WindowToggleSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            if (outerValue === this.openings) {
                var closingSelector = this.closingSelector;
                var closingNotifier = tryCatch_15.tryCatch(closingSelector)(innerValue);
                if (closingNotifier === errorObject_16.errorObject) {
                    return this.error(errorObject_16.errorObject.e);
                }
                else {
                    var window_5 = new Subject_14.Subject();
                    var subscription = new Subscription_15.Subscription();
                    var context = { window: window_5, subscription: subscription };
                    this.contexts.push(context);
                    var innerSubscription = subscribeToResult_35.subscribeToResult(this, closingNotifier, context);
                    if (innerSubscription.closed) {
                        this.closeWindow(this.contexts.length - 1);
                    }
                    else {
                        innerSubscription.context = context;
                        subscription.add(innerSubscription);
                    }
                    this.destination.next(window_5);
                }
            }
            else {
                this.closeWindow(this.contexts.indexOf(outerValue));
            }
        };
        WindowToggleSubscriber.prototype.notifyError = function (err) {
            this.error(err);
        };
        WindowToggleSubscriber.prototype.notifyComplete = function (inner) {
            if (inner !== this.openSubscription) {
                this.closeWindow(this.contexts.indexOf(inner.context));
            }
        };
        WindowToggleSubscriber.prototype.closeWindow = function (index) {
            if (index === -1) {
                return;
            }
            var contexts = this.contexts;
            var context = contexts[index];
            var window = context.window, subscription = context.subscription;
            contexts.splice(index, 1);
            window.complete();
            subscription.unsubscribe();
        };
        return WindowToggleSubscriber;
    }(OuterSubscriber_35.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/windowToggle", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/windowToggle"], function (require, exports, Observable_157, windowToggle_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_157.Observable.prototype.windowToggle = windowToggle_1.windowToggle;
});
define("node_modules/rxjs/src/operator/windowWhen", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/util/tryCatch", "node_modules/rxjs/src/util/errorObject", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, Subject_15, tryCatch_16, errorObject_17, OuterSubscriber_36, subscribeToResult_36) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function windowWhen(closingSelector) {
        return this.lift(new WindowOperator(closingSelector));
    }
    exports.windowWhen = windowWhen;
    var WindowOperator = (function () {
        function WindowOperator(closingSelector) {
            this.closingSelector = closingSelector;
        }
        WindowOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new WindowSubscriber(subscriber, this.closingSelector));
        };
        return WindowOperator;
    }());
    var WindowSubscriber = (function (_super) {
        __extends(WindowSubscriber, _super);
        function WindowSubscriber(destination, closingSelector) {
            var _this = _super.call(this, destination) || this;
            _this.destination = destination;
            _this.closingSelector = closingSelector;
            _this.openWindow();
            return _this;
        }
        WindowSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.openWindow(innerSub);
        };
        WindowSubscriber.prototype.notifyError = function (error, innerSub) {
            this._error(error);
        };
        WindowSubscriber.prototype.notifyComplete = function (innerSub) {
            this.openWindow(innerSub);
        };
        WindowSubscriber.prototype._next = function (value) {
            this.window.next(value);
        };
        WindowSubscriber.prototype._error = function (err) {
            this.window.error(err);
            this.destination.error(err);
            this.unsubscribeClosingNotification();
        };
        WindowSubscriber.prototype._complete = function () {
            this.window.complete();
            this.destination.complete();
            this.unsubscribeClosingNotification();
        };
        WindowSubscriber.prototype.unsubscribeClosingNotification = function () {
            if (this.closingNotification) {
                this.closingNotification.unsubscribe();
            }
        };
        WindowSubscriber.prototype.openWindow = function (innerSub) {
            if (innerSub === void 0) { innerSub = null; }
            if (innerSub) {
                this.remove(innerSub);
                innerSub.unsubscribe();
            }
            var prevWindow = this.window;
            if (prevWindow) {
                prevWindow.complete();
            }
            var window = this.window = new Subject_15.Subject();
            this.destination.next(window);
            var closingNotifier = tryCatch_16.tryCatch(this.closingSelector)();
            if (closingNotifier === errorObject_17.errorObject) {
                var err = errorObject_17.errorObject.e;
                this.destination.error(err);
                this.window.error(err);
            }
            else {
                this.add(this.closingNotification = subscribeToResult_36.subscribeToResult(this, closingNotifier));
            }
        };
        return WindowSubscriber;
    }(OuterSubscriber_36.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/windowWhen", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/windowWhen"], function (require, exports, Observable_158, windowWhen_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_158.Observable.prototype.windowWhen = windowWhen_1.windowWhen;
});
define("node_modules/rxjs/src/operator/withLatestFrom", ["require", "exports", "node_modules/rxjs/src/OuterSubscriber", "node_modules/rxjs/src/util/subscribeToResult"], function (require, exports, OuterSubscriber_37, subscribeToResult_37) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function withLatestFrom() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var project;
        if (typeof args[args.length - 1] === 'function') {
            project = args.pop();
        }
        var observables = args;
        return this.lift(new WithLatestFromOperator(observables, project));
    }
    exports.withLatestFrom = withLatestFrom;
    var WithLatestFromOperator = (function () {
        function WithLatestFromOperator(observables, project) {
            this.observables = observables;
            this.project = project;
        }
        WithLatestFromOperator.prototype.call = function (subscriber, source) {
            return source.subscribe(new WithLatestFromSubscriber(subscriber, this.observables, this.project));
        };
        return WithLatestFromOperator;
    }());
    var WithLatestFromSubscriber = (function (_super) {
        __extends(WithLatestFromSubscriber, _super);
        function WithLatestFromSubscriber(destination, observables, project) {
            var _this = _super.call(this, destination) || this;
            _this.observables = observables;
            _this.project = project;
            _this.toRespond = [];
            var len = observables.length;
            _this.values = new Array(len);
            for (var i = 0; i < len; i++) {
                _this.toRespond.push(i);
            }
            for (var i = 0; i < len; i++) {
                var observable = observables[i];
                _this.add(subscribeToResult_37.subscribeToResult(_this, observable, observable, i));
            }
            return _this;
        }
        WithLatestFromSubscriber.prototype.notifyNext = function (outerValue, innerValue, outerIndex, innerIndex, innerSub) {
            this.values[outerIndex] = innerValue;
            var toRespond = this.toRespond;
            if (toRespond.length > 0) {
                var found = toRespond.indexOf(outerIndex);
                if (found !== -1) {
                    toRespond.splice(found, 1);
                }
            }
        };
        WithLatestFromSubscriber.prototype.notifyComplete = function () {
        };
        WithLatestFromSubscriber.prototype._next = function (value) {
            if (this.toRespond.length === 0) {
                var args = [value].concat(this.values);
                if (this.project) {
                    this._tryProject(args);
                }
                else {
                    this.destination.next(args);
                }
            }
        };
        WithLatestFromSubscriber.prototype._tryProject = function (args) {
            var result;
            try {
                result = this.project.apply(this, args);
            }
            catch (err) {
                this.destination.error(err);
                return;
            }
            this.destination.next(result);
        };
        return WithLatestFromSubscriber;
    }(OuterSubscriber_37.OuterSubscriber));
});
define("node_modules/rxjs/src/add/operator/withLatestFrom", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/withLatestFrom"], function (require, exports, Observable_159, withLatestFrom_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_159.Observable.prototype.withLatestFrom = withLatestFrom_1.withLatestFrom;
});
define("node_modules/rxjs/src/add/operator/zip", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/zip"], function (require, exports, Observable_160, zip_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_160.Observable.prototype.zip = zip_3.zipProto;
});
define("node_modules/rxjs/src/operator/zipAll", ["require", "exports", "node_modules/rxjs/src/operator/zip"], function (require, exports, zip_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function zipAll(project) {
        return this.lift(new zip_4.ZipOperator(project));
    }
    exports.zipAll = zipAll;
});
define("node_modules/rxjs/src/add/operator/zipAll", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/operator/zipAll"], function (require, exports, Observable_161, zipAll_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    Observable_161.Observable.prototype.zipAll = zipAll_1.zipAll;
});
define("node_modules/rxjs/src/testing/TestMessage", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("node_modules/rxjs/src/testing/SubscriptionLog", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SubscriptionLog = (function () {
        function SubscriptionLog(subscribedFrame, unsubscribedFrame) {
            if (unsubscribedFrame === void 0) { unsubscribedFrame = Number.POSITIVE_INFINITY; }
            this.subscribedFrame = subscribedFrame;
            this.unsubscribedFrame = unsubscribedFrame;
        }
        return SubscriptionLog;
    }());
    exports.SubscriptionLog = SubscriptionLog;
});
define("node_modules/rxjs/src/testing/SubscriptionLoggable", ["require", "exports", "node_modules/rxjs/src/testing/SubscriptionLog"], function (require, exports, SubscriptionLog_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SubscriptionLoggable = (function () {
        function SubscriptionLoggable() {
            this.subscriptions = [];
        }
        SubscriptionLoggable.prototype.logSubscribedFrame = function () {
            this.subscriptions.push(new SubscriptionLog_1.SubscriptionLog(this.scheduler.now()));
            return this.subscriptions.length - 1;
        };
        SubscriptionLoggable.prototype.logUnsubscribedFrame = function (index) {
            var subscriptionLogs = this.subscriptions;
            var oldSubscriptionLog = subscriptionLogs[index];
            subscriptionLogs[index] = new SubscriptionLog_1.SubscriptionLog(oldSubscriptionLog.subscribedFrame, this.scheduler.now());
        };
        return SubscriptionLoggable;
    }());
    exports.SubscriptionLoggable = SubscriptionLoggable;
});
define("node_modules/rxjs/src/util/applyMixins", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function applyMixins(derivedCtor, baseCtors) {
        for (var i = 0, len = baseCtors.length; i < len; i++) {
            var baseCtor = baseCtors[i];
            var propertyKeys = Object.getOwnPropertyNames(baseCtor.prototype);
            for (var j = 0, len2 = propertyKeys.length; j < len2; j++) {
                var name_1 = propertyKeys[j];
                derivedCtor.prototype[name_1] = baseCtor.prototype[name_1];
            }
        }
    }
    exports.applyMixins = applyMixins;
});
define("node_modules/rxjs/src/testing/ColdObservable", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/testing/SubscriptionLoggable", "node_modules/rxjs/src/util/applyMixins"], function (require, exports, Observable_162, Subscription_16, SubscriptionLoggable_1, applyMixins_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ColdObservable = (function (_super) {
        __extends(ColdObservable, _super);
        function ColdObservable(messages, scheduler) {
            var _this = _super.call(this, function (subscriber) {
                var observable = this;
                var index = observable.logSubscribedFrame();
                subscriber.add(new Subscription_16.Subscription(function () {
                    observable.logUnsubscribedFrame(index);
                }));
                observable.scheduleMessages(subscriber);
                return subscriber;
            }) || this;
            _this.messages = messages;
            _this.subscriptions = [];
            _this.scheduler = scheduler;
            return _this;
        }
        ColdObservable.prototype.scheduleMessages = function (subscriber) {
            var messagesLength = this.messages.length;
            for (var i = 0; i < messagesLength; i++) {
                var message = this.messages[i];
                subscriber.add(this.scheduler.schedule(function (_a) {
                    var message = _a.message, subscriber = _a.subscriber;
                    message.notification.observe(subscriber);
                }, message.frame, { message: message, subscriber: subscriber }));
            }
        };
        return ColdObservable;
    }(Observable_162.Observable));
    exports.ColdObservable = ColdObservable;
    applyMixins_1.applyMixins(ColdObservable, [SubscriptionLoggable_1.SubscriptionLoggable]);
});
define("node_modules/rxjs/src/testing/HotObservable", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/testing/SubscriptionLoggable", "node_modules/rxjs/src/util/applyMixins"], function (require, exports, Subject_16, Subscription_17, SubscriptionLoggable_2, applyMixins_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var HotObservable = (function (_super) {
        __extends(HotObservable, _super);
        function HotObservable(messages, scheduler) {
            var _this = _super.call(this) || this;
            _this.messages = messages;
            _this.subscriptions = [];
            _this.scheduler = scheduler;
            return _this;
        }
        HotObservable.prototype._subscribe = function (subscriber) {
            var subject = this;
            var index = subject.logSubscribedFrame();
            subscriber.add(new Subscription_17.Subscription(function () {
                subject.logUnsubscribedFrame(index);
            }));
            return _super.prototype._subscribe.call(this, subscriber);
        };
        HotObservable.prototype.setup = function () {
            var subject = this;
            var messagesLength = subject.messages.length;
            for (var i = 0; i < messagesLength; i++) {
                (function () {
                    var message = subject.messages[i];
                    subject.scheduler.schedule(function () { message.notification.observe(subject); }, message.frame);
                })();
            }
        };
        return HotObservable;
    }(Subject_16.Subject));
    exports.HotObservable = HotObservable;
    applyMixins_2.applyMixins(HotObservable, [SubscriptionLoggable_2.SubscriptionLoggable]);
});
define("node_modules/rxjs/src/scheduler/VirtualTimeScheduler", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncAction", "node_modules/rxjs/src/scheduler/AsyncScheduler"], function (require, exports, AsyncAction_4, AsyncScheduler_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var VirtualTimeScheduler = (function (_super) {
        __extends(VirtualTimeScheduler, _super);
        function VirtualTimeScheduler(SchedulerAction, maxFrames) {
            if (SchedulerAction === void 0) { SchedulerAction = VirtualAction; }
            if (maxFrames === void 0) { maxFrames = Number.POSITIVE_INFINITY; }
            var _this = _super.call(this, SchedulerAction, function () { return _this.frame; }) || this;
            _this.maxFrames = maxFrames;
            _this.frame = 0;
            _this.index = -1;
            return _this;
        }
        VirtualTimeScheduler.prototype.flush = function () {
            var _a = this, actions = _a.actions, maxFrames = _a.maxFrames;
            var error, action;
            while ((action = actions.shift()) && (this.frame = action.delay) <= maxFrames) {
                if (error = action.execute(action.state, action.delay)) {
                    break;
                }
            }
            if (error) {
                while (action = actions.shift()) {
                    action.unsubscribe();
                }
                throw error;
            }
        };
        return VirtualTimeScheduler;
    }(AsyncScheduler_4.AsyncScheduler));
    VirtualTimeScheduler.frameTimeFactor = 10;
    exports.VirtualTimeScheduler = VirtualTimeScheduler;
    var VirtualAction = (function (_super) {
        __extends(VirtualAction, _super);
        function VirtualAction(scheduler, work, index) {
            if (index === void 0) { index = scheduler.index += 1; }
            var _this = _super.call(this, scheduler, work) || this;
            _this.scheduler = scheduler;
            _this.work = work;
            _this.index = index;
            _this.active = true;
            _this.index = scheduler.index = index;
            return _this;
        }
        VirtualAction.prototype.schedule = function (state, delay) {
            if (delay === void 0) { delay = 0; }
            if (!this.id) {
                return _super.prototype.schedule.call(this, state, delay);
            }
            this.active = false;
            var action = new VirtualAction(this.scheduler, this.work);
            this.add(action);
            return action.schedule(state, delay);
        };
        VirtualAction.prototype.requestAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            this.delay = scheduler.frame + delay;
            var actions = scheduler.actions;
            actions.push(this);
            actions.sort(VirtualAction.sortActions);
            return true;
        };
        VirtualAction.prototype.recycleAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            return undefined;
        };
        VirtualAction.prototype._execute = function (state, delay) {
            if (this.active === true) {
                return _super.prototype._execute.call(this, state, delay);
            }
        };
        VirtualAction.sortActions = function (a, b) {
            if (a.delay === b.delay) {
                if (a.index === b.index) {
                    return 0;
                }
                else if (a.index > b.index) {
                    return 1;
                }
                else {
                    return -1;
                }
            }
            else if (a.delay > b.delay) {
                return 1;
            }
            else {
                return -1;
            }
        };
        return VirtualAction;
    }(AsyncAction_4.AsyncAction));
    exports.VirtualAction = VirtualAction;
});
define("node_modules/rxjs/src/testing/TestScheduler", ["require", "exports", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Notification", "node_modules/rxjs/src/testing/ColdObservable", "node_modules/rxjs/src/testing/HotObservable", "node_modules/rxjs/src/testing/SubscriptionLog", "node_modules/rxjs/src/scheduler/VirtualTimeScheduler"], function (require, exports, Observable_163, Notification_4, ColdObservable_1, HotObservable_1, SubscriptionLog_2, VirtualTimeScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var defaultMaxFrame = 750;
    var TestScheduler = (function (_super) {
        __extends(TestScheduler, _super);
        function TestScheduler(assertDeepEqual) {
            var _this = _super.call(this, VirtualTimeScheduler_1.VirtualAction, defaultMaxFrame) || this;
            _this.assertDeepEqual = assertDeepEqual;
            _this.hotObservables = [];
            _this.coldObservables = [];
            _this.flushTests = [];
            return _this;
        }
        TestScheduler.prototype.createTime = function (marbles) {
            var indexOf = marbles.indexOf('|');
            if (indexOf === -1) {
                throw new Error('marble diagram for time should have a completion marker "|"');
            }
            return indexOf * TestScheduler.frameTimeFactor;
        };
        TestScheduler.prototype.createColdObservable = function (marbles, values, error) {
            if (marbles.indexOf('^') !== -1) {
                throw new Error('cold observable cannot have subscription offset "^"');
            }
            if (marbles.indexOf('!') !== -1) {
                throw new Error('cold observable cannot have unsubscription marker "!"');
            }
            var messages = TestScheduler.parseMarbles(marbles, values, error);
            var cold = new ColdObservable_1.ColdObservable(messages, this);
            this.coldObservables.push(cold);
            return cold;
        };
        TestScheduler.prototype.createHotObservable = function (marbles, values, error) {
            if (marbles.indexOf('!') !== -1) {
                throw new Error('hot observable cannot have unsubscription marker "!"');
            }
            var messages = TestScheduler.parseMarbles(marbles, values, error);
            var subject = new HotObservable_1.HotObservable(messages, this);
            this.hotObservables.push(subject);
            return subject;
        };
        TestScheduler.prototype.materializeInnerObservable = function (observable, outerFrame) {
            var _this = this;
            var messages = [];
            observable.subscribe(function (value) {
                messages.push({ frame: _this.frame - outerFrame, notification: Notification_4.Notification.createNext(value) });
            }, function (err) {
                messages.push({ frame: _this.frame - outerFrame, notification: Notification_4.Notification.createError(err) });
            }, function () {
                messages.push({ frame: _this.frame - outerFrame, notification: Notification_4.Notification.createComplete() });
            });
            return messages;
        };
        TestScheduler.prototype.expectObservable = function (observable, unsubscriptionMarbles) {
            var _this = this;
            if (unsubscriptionMarbles === void 0) { unsubscriptionMarbles = null; }
            var actual = [];
            var flushTest = { actual: actual, ready: false };
            var unsubscriptionFrame = TestScheduler
                .parseMarblesAsSubscriptions(unsubscriptionMarbles).unsubscribedFrame;
            var subscription;
            this.schedule(function () {
                subscription = observable.subscribe(function (x) {
                    var value = x;
                    if (x instanceof Observable_163.Observable) {
                        value = _this.materializeInnerObservable(value, _this.frame);
                    }
                    actual.push({ frame: _this.frame, notification: Notification_4.Notification.createNext(value) });
                }, function (err) {
                    actual.push({ frame: _this.frame, notification: Notification_4.Notification.createError(err) });
                }, function () {
                    actual.push({ frame: _this.frame, notification: Notification_4.Notification.createComplete() });
                });
            }, 0);
            if (unsubscriptionFrame !== Number.POSITIVE_INFINITY) {
                this.schedule(function () { return subscription.unsubscribe(); }, unsubscriptionFrame);
            }
            this.flushTests.push(flushTest);
            return {
                toBe: function (marbles, values, errorValue) {
                    flushTest.ready = true;
                    flushTest.expected = TestScheduler.parseMarbles(marbles, values, errorValue, true);
                }
            };
        };
        TestScheduler.prototype.expectSubscriptions = function (actualSubscriptionLogs) {
            var flushTest = { actual: actualSubscriptionLogs, ready: false };
            this.flushTests.push(flushTest);
            return {
                toBe: function (marbles) {
                    var marblesArray = (typeof marbles === 'string') ? [marbles] : marbles;
                    flushTest.ready = true;
                    flushTest.expected = marblesArray.map(function (marbles) {
                        return TestScheduler.parseMarblesAsSubscriptions(marbles);
                    });
                }
            };
        };
        TestScheduler.prototype.flush = function () {
            var hotObservables = this.hotObservables;
            while (hotObservables.length > 0) {
                hotObservables.shift().setup();
            }
            _super.prototype.flush.call(this);
            var readyFlushTests = this.flushTests.filter(function (test) { return test.ready; });
            while (readyFlushTests.length > 0) {
                var test = readyFlushTests.shift();
                this.assertDeepEqual(test.actual, test.expected);
            }
        };
        TestScheduler.parseMarblesAsSubscriptions = function (marbles) {
            if (typeof marbles !== 'string') {
                return new SubscriptionLog_2.SubscriptionLog(Number.POSITIVE_INFINITY);
            }
            var len = marbles.length;
            var groupStart = -1;
            var subscriptionFrame = Number.POSITIVE_INFINITY;
            var unsubscriptionFrame = Number.POSITIVE_INFINITY;
            for (var i = 0; i < len; i++) {
                var frame = i * this.frameTimeFactor;
                var c = marbles[i];
                switch (c) {
                    case '-':
                    case ' ':
                        break;
                    case '(':
                        groupStart = frame;
                        break;
                    case ')':
                        groupStart = -1;
                        break;
                    case '^':
                        if (subscriptionFrame !== Number.POSITIVE_INFINITY) {
                            throw new Error('found a second subscription point \'^\' in a ' +
                                'subscription marble diagram. There can only be one.');
                        }
                        subscriptionFrame = groupStart > -1 ? groupStart : frame;
                        break;
                    case '!':
                        if (unsubscriptionFrame !== Number.POSITIVE_INFINITY) {
                            throw new Error('found a second subscription point \'^\' in a ' +
                                'subscription marble diagram. There can only be one.');
                        }
                        unsubscriptionFrame = groupStart > -1 ? groupStart : frame;
                        break;
                    default:
                        throw new Error('there can only be \'^\' and \'!\' markers in a ' +
                            'subscription marble diagram. Found instead \'' + c + '\'.');
                }
            }
            if (unsubscriptionFrame < 0) {
                return new SubscriptionLog_2.SubscriptionLog(subscriptionFrame);
            }
            else {
                return new SubscriptionLog_2.SubscriptionLog(subscriptionFrame, unsubscriptionFrame);
            }
        };
        TestScheduler.parseMarbles = function (marbles, values, errorValue, materializeInnerObservables) {
            if (materializeInnerObservables === void 0) { materializeInnerObservables = false; }
            if (marbles.indexOf('!') !== -1) {
                throw new Error('conventional marble diagrams cannot have the ' +
                    'unsubscription marker "!"');
            }
            var len = marbles.length;
            var testMessages = [];
            var subIndex = marbles.indexOf('^');
            var frameOffset = subIndex === -1 ? 0 : (subIndex * -this.frameTimeFactor);
            var getValue = typeof values !== 'object' ?
                function (x) { return x; } :
                function (x) {
                    if (materializeInnerObservables && values[x] instanceof ColdObservable_1.ColdObservable) {
                        return values[x].messages;
                    }
                    return values[x];
                };
            var groupStart = -1;
            for (var i = 0; i < len; i++) {
                var frame = i * this.frameTimeFactor + frameOffset;
                var notification = void 0;
                var c = marbles[i];
                switch (c) {
                    case '-':
                    case ' ':
                        break;
                    case '(':
                        groupStart = frame;
                        break;
                    case ')':
                        groupStart = -1;
                        break;
                    case '|':
                        notification = Notification_4.Notification.createComplete();
                        break;
                    case '^':
                        break;
                    case '#':
                        notification = Notification_4.Notification.createError(errorValue || 'error');
                        break;
                    default:
                        notification = Notification_4.Notification.createNext(getValue(c));
                        break;
                }
                if (notification) {
                    testMessages.push({ frame: groupStart > -1 ? groupStart : frame, notification: notification });
                }
            }
            return testMessages;
        };
        return TestScheduler;
    }(VirtualTimeScheduler_1.VirtualTimeScheduler));
    exports.TestScheduler = TestScheduler;
});
define("node_modules/rxjs/src/util/AnimationFrame", ["require", "exports", "node_modules/rxjs/src/util/root"], function (require, exports, root_16) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var RequestAnimationFrameDefinition = (function () {
        function RequestAnimationFrameDefinition(root) {
            if (root.requestAnimationFrame) {
                this.cancelAnimationFrame = root.cancelAnimationFrame.bind(root);
                this.requestAnimationFrame = root.requestAnimationFrame.bind(root);
            }
            else if (root.mozRequestAnimationFrame) {
                this.cancelAnimationFrame = root.mozCancelAnimationFrame.bind(root);
                this.requestAnimationFrame = root.mozRequestAnimationFrame.bind(root);
            }
            else if (root.webkitRequestAnimationFrame) {
                this.cancelAnimationFrame = root.webkitCancelAnimationFrame.bind(root);
                this.requestAnimationFrame = root.webkitRequestAnimationFrame.bind(root);
            }
            else if (root.msRequestAnimationFrame) {
                this.cancelAnimationFrame = root.msCancelAnimationFrame.bind(root);
                this.requestAnimationFrame = root.msRequestAnimationFrame.bind(root);
            }
            else if (root.oRequestAnimationFrame) {
                this.cancelAnimationFrame = root.oCancelAnimationFrame.bind(root);
                this.requestAnimationFrame = root.oRequestAnimationFrame.bind(root);
            }
            else {
                this.cancelAnimationFrame = root.clearTimeout.bind(root);
                this.requestAnimationFrame = function (cb) { return root.setTimeout(cb, 1000 / 60); };
            }
        }
        return RequestAnimationFrameDefinition;
    }());
    exports.RequestAnimationFrameDefinition = RequestAnimationFrameDefinition;
    exports.AnimationFrame = new RequestAnimationFrameDefinition(root_16.root);
});
define("node_modules/rxjs/src/scheduler/AnimationFrameScheduler", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncScheduler"], function (require, exports, AsyncScheduler_5) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AnimationFrameScheduler = (function (_super) {
        __extends(AnimationFrameScheduler, _super);
        function AnimationFrameScheduler() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        AnimationFrameScheduler.prototype.flush = function (action) {
            this.active = true;
            this.scheduled = undefined;
            var actions = this.actions;
            var error;
            var index = -1;
            var count = actions.length;
            action = action || actions.shift();
            do {
                if (error = action.execute(action.state, action.delay)) {
                    break;
                }
            } while (++index < count && (action = actions.shift()));
            this.active = false;
            if (error) {
                while (++index < count && (action = actions.shift())) {
                    action.unsubscribe();
                }
                throw error;
            }
        };
        return AnimationFrameScheduler;
    }(AsyncScheduler_5.AsyncScheduler));
    exports.AnimationFrameScheduler = AnimationFrameScheduler;
});
define("node_modules/rxjs/src/scheduler/AnimationFrameAction", ["require", "exports", "node_modules/rxjs/src/scheduler/AsyncAction", "node_modules/rxjs/src/util/AnimationFrame"], function (require, exports, AsyncAction_5, AnimationFrame_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AnimationFrameAction = (function (_super) {
        __extends(AnimationFrameAction, _super);
        function AnimationFrameAction(scheduler, work) {
            var _this = _super.call(this, scheduler, work) || this;
            _this.scheduler = scheduler;
            _this.work = work;
            return _this;
        }
        AnimationFrameAction.prototype.requestAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if (delay !== null && delay > 0) {
                return _super.prototype.requestAsyncId.call(this, scheduler, id, delay);
            }
            scheduler.actions.push(this);
            return scheduler.scheduled || (scheduler.scheduled = AnimationFrame_1.AnimationFrame.requestAnimationFrame(scheduler.flush.bind(scheduler, null)));
        };
        AnimationFrameAction.prototype.recycleAsyncId = function (scheduler, id, delay) {
            if (delay === void 0) { delay = 0; }
            if ((delay !== null && delay > 0) || (delay === null && this.delay > 0)) {
                return _super.prototype.recycleAsyncId.call(this, scheduler, id, delay);
            }
            if (scheduler.actions.length === 0) {
                AnimationFrame_1.AnimationFrame.cancelAnimationFrame(id);
                scheduler.scheduled = undefined;
            }
            return undefined;
        };
        return AnimationFrameAction;
    }(AsyncAction_5.AsyncAction));
    exports.AnimationFrameAction = AnimationFrameAction;
});
define("node_modules/rxjs/src/scheduler/animationFrame", ["require", "exports", "node_modules/rxjs/src/scheduler/AnimationFrameAction", "node_modules/rxjs/src/scheduler/AnimationFrameScheduler"], function (require, exports, AnimationFrameAction_1, AnimationFrameScheduler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.animationFrame = new AnimationFrameScheduler_1.AnimationFrameScheduler(AnimationFrameAction_1.AnimationFrameAction);
});
define("node_modules/rxjs/src/Rx", ["require", "exports", "node_modules/rxjs/src/Subject", "node_modules/rxjs/src/Observable", "node_modules/rxjs/src/Subscription", "node_modules/rxjs/src/Subscriber", "node_modules/rxjs/src/AsyncSubject", "node_modules/rxjs/src/ReplaySubject", "node_modules/rxjs/src/BehaviorSubject", "node_modules/rxjs/src/observable/ConnectableObservable", "node_modules/rxjs/src/Notification", "node_modules/rxjs/src/util/EmptyError", "node_modules/rxjs/src/util/ArgumentOutOfRangeError", "node_modules/rxjs/src/util/ObjectUnsubscribedError", "node_modules/rxjs/src/util/TimeoutError", "node_modules/rxjs/src/util/UnsubscriptionError", "node_modules/rxjs/src/operator/timeInterval", "node_modules/rxjs/src/operator/timestamp", "node_modules/rxjs/src/testing/TestScheduler", "node_modules/rxjs/src/scheduler/VirtualTimeScheduler", "node_modules/rxjs/src/observable/dom/AjaxObservable", "node_modules/rxjs/src/scheduler/asap", "node_modules/rxjs/src/scheduler/async", "node_modules/rxjs/src/scheduler/queue", "node_modules/rxjs/src/scheduler/animationFrame", "node_modules/rxjs/src/symbol/rxSubscriber", "node_modules/rxjs/src/symbol/iterator", "node_modules/rxjs/src/symbol/observable", "node_modules/rxjs/src/add/observable/bindCallback", "node_modules/rxjs/src/add/observable/bindNodeCallback", "node_modules/rxjs/src/add/observable/combineLatest", "node_modules/rxjs/src/add/observable/concat", "node_modules/rxjs/src/add/observable/defer", "node_modules/rxjs/src/add/observable/empty", "node_modules/rxjs/src/add/observable/forkJoin", "node_modules/rxjs/src/add/observable/from", "node_modules/rxjs/src/add/observable/fromEvent", "node_modules/rxjs/src/add/observable/fromEventPattern", "node_modules/rxjs/src/add/observable/fromPromise", "node_modules/rxjs/src/add/observable/generate", "node_modules/rxjs/src/add/observable/if", "node_modules/rxjs/src/add/observable/interval", "node_modules/rxjs/src/add/observable/merge", "node_modules/rxjs/src/add/observable/race", "node_modules/rxjs/src/add/observable/never", "node_modules/rxjs/src/add/observable/of", "node_modules/rxjs/src/add/observable/onErrorResumeNext", "node_modules/rxjs/src/add/observable/pairs", "node_modules/rxjs/src/add/observable/range", "node_modules/rxjs/src/add/observable/using", "node_modules/rxjs/src/add/observable/throw", "node_modules/rxjs/src/add/observable/timer", "node_modules/rxjs/src/add/observable/zip", "node_modules/rxjs/src/add/observable/dom/ajax", "node_modules/rxjs/src/add/observable/dom/webSocket", "node_modules/rxjs/src/add/operator/buffer", "node_modules/rxjs/src/add/operator/bufferCount", "node_modules/rxjs/src/add/operator/bufferTime", "node_modules/rxjs/src/add/operator/bufferToggle", "node_modules/rxjs/src/add/operator/bufferWhen", "node_modules/rxjs/src/add/operator/catch", "node_modules/rxjs/src/add/operator/combineAll", "node_modules/rxjs/src/add/operator/combineLatest", "node_modules/rxjs/src/add/operator/concat", "node_modules/rxjs/src/add/operator/concatAll", "node_modules/rxjs/src/add/operator/concatMap", "node_modules/rxjs/src/add/operator/concatMapTo", "node_modules/rxjs/src/add/operator/count", "node_modules/rxjs/src/add/operator/dematerialize", "node_modules/rxjs/src/add/operator/debounce", "node_modules/rxjs/src/add/operator/debounceTime", "node_modules/rxjs/src/add/operator/defaultIfEmpty", "node_modules/rxjs/src/add/operator/delay", "node_modules/rxjs/src/add/operator/delayWhen", "node_modules/rxjs/src/add/operator/distinct", "node_modules/rxjs/src/add/operator/distinctUntilChanged", "node_modules/rxjs/src/add/operator/distinctUntilKeyChanged", "node_modules/rxjs/src/add/operator/do", "node_modules/rxjs/src/add/operator/exhaust", "node_modules/rxjs/src/add/operator/exhaustMap", "node_modules/rxjs/src/add/operator/expand", "node_modules/rxjs/src/add/operator/elementAt", "node_modules/rxjs/src/add/operator/filter", "node_modules/rxjs/src/add/operator/finally", "node_modules/rxjs/src/add/operator/find", "node_modules/rxjs/src/add/operator/findIndex", "node_modules/rxjs/src/add/operator/first", "node_modules/rxjs/src/add/operator/groupBy", "node_modules/rxjs/src/add/operator/ignoreElements", "node_modules/rxjs/src/add/operator/isEmpty", "node_modules/rxjs/src/add/operator/audit", "node_modules/rxjs/src/add/operator/auditTime", "node_modules/rxjs/src/add/operator/last", "node_modules/rxjs/src/add/operator/let", "node_modules/rxjs/src/add/operator/every", "node_modules/rxjs/src/add/operator/map", "node_modules/rxjs/src/add/operator/mapTo", "node_modules/rxjs/src/add/operator/materialize", "node_modules/rxjs/src/add/operator/max", "node_modules/rxjs/src/add/operator/merge", "node_modules/rxjs/src/add/operator/mergeAll", "node_modules/rxjs/src/add/operator/mergeMap", "node_modules/rxjs/src/add/operator/mergeMapTo", "node_modules/rxjs/src/add/operator/mergeScan", "node_modules/rxjs/src/add/operator/min", "node_modules/rxjs/src/add/operator/multicast", "node_modules/rxjs/src/add/operator/observeOn", "node_modules/rxjs/src/add/operator/onErrorResumeNext", "node_modules/rxjs/src/add/operator/pairwise", "node_modules/rxjs/src/add/operator/partition", "node_modules/rxjs/src/add/operator/pluck", "node_modules/rxjs/src/add/operator/publish", "node_modules/rxjs/src/add/operator/publishBehavior", "node_modules/rxjs/src/add/operator/publishReplay", "node_modules/rxjs/src/add/operator/publishLast", "node_modules/rxjs/src/add/operator/race", "node_modules/rxjs/src/add/operator/reduce", "node_modules/rxjs/src/add/operator/repeat", "node_modules/rxjs/src/add/operator/repeatWhen", "node_modules/rxjs/src/add/operator/retry", "node_modules/rxjs/src/add/operator/retryWhen", "node_modules/rxjs/src/add/operator/sample", "node_modules/rxjs/src/add/operator/sampleTime", "node_modules/rxjs/src/add/operator/scan", "node_modules/rxjs/src/add/operator/sequenceEqual", "node_modules/rxjs/src/add/operator/share", "node_modules/rxjs/src/add/operator/single", "node_modules/rxjs/src/add/operator/skip", "node_modules/rxjs/src/add/operator/skipUntil", "node_modules/rxjs/src/add/operator/skipWhile", "node_modules/rxjs/src/add/operator/startWith", "node_modules/rxjs/src/add/operator/subscribeOn", "node_modules/rxjs/src/add/operator/switch", "node_modules/rxjs/src/add/operator/switchMap", "node_modules/rxjs/src/add/operator/switchMapTo", "node_modules/rxjs/src/add/operator/take", "node_modules/rxjs/src/add/operator/takeLast", "node_modules/rxjs/src/add/operator/takeUntil", "node_modules/rxjs/src/add/operator/takeWhile", "node_modules/rxjs/src/add/operator/throttle", "node_modules/rxjs/src/add/operator/throttleTime", "node_modules/rxjs/src/add/operator/timeInterval", "node_modules/rxjs/src/add/operator/timeout", "node_modules/rxjs/src/add/operator/timeoutWith", "node_modules/rxjs/src/add/operator/timestamp", "node_modules/rxjs/src/add/operator/toArray", "node_modules/rxjs/src/add/operator/toPromise", "node_modules/rxjs/src/add/operator/window", "node_modules/rxjs/src/add/operator/windowCount", "node_modules/rxjs/src/add/operator/windowTime", "node_modules/rxjs/src/add/operator/windowToggle", "node_modules/rxjs/src/add/operator/windowWhen", "node_modules/rxjs/src/add/operator/withLatestFrom", "node_modules/rxjs/src/add/operator/zip", "node_modules/rxjs/src/add/operator/zipAll"], function (require, exports, Subject_17, Observable_164, Subscription_18, Subscriber_54, AsyncSubject_4, ReplaySubject_3, BehaviorSubject_2, ConnectableObservable_2, Notification_5, EmptyError_4, ArgumentOutOfRangeError_4, ObjectUnsubscribedError_4, TimeoutError_2, UnsubscriptionError_2, timeInterval_2, timestamp_2, TestScheduler_1, VirtualTimeScheduler_2, AjaxObservable_2, asap_2, async_14, queue_2, animationFrame_1, rxSubscriber_4, iterator_5, observable_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Subject = Subject_17.Subject;
    exports.AnonymousSubject = Subject_17.AnonymousSubject;
    exports.Observable = Observable_164.Observable;
    exports.Subscription = Subscription_18.Subscription;
    exports.Subscriber = Subscriber_54.Subscriber;
    exports.AsyncSubject = AsyncSubject_4.AsyncSubject;
    exports.ReplaySubject = ReplaySubject_3.ReplaySubject;
    exports.BehaviorSubject = BehaviorSubject_2.BehaviorSubject;
    exports.ConnectableObservable = ConnectableObservable_2.ConnectableObservable;
    exports.Notification = Notification_5.Notification;
    exports.EmptyError = EmptyError_4.EmptyError;
    exports.ArgumentOutOfRangeError = ArgumentOutOfRangeError_4.ArgumentOutOfRangeError;
    exports.ObjectUnsubscribedError = ObjectUnsubscribedError_4.ObjectUnsubscribedError;
    exports.TimeoutError = TimeoutError_2.TimeoutError;
    exports.UnsubscriptionError = UnsubscriptionError_2.UnsubscriptionError;
    exports.TimeInterval = timeInterval_2.TimeInterval;
    exports.Timestamp = timestamp_2.Timestamp;
    exports.TestScheduler = TestScheduler_1.TestScheduler;
    exports.VirtualTimeScheduler = VirtualTimeScheduler_2.VirtualTimeScheduler;
    exports.AjaxResponse = AjaxObservable_2.AjaxResponse;
    exports.AjaxError = AjaxObservable_2.AjaxError;
    exports.AjaxTimeoutError = AjaxObservable_2.AjaxTimeoutError;
    var Scheduler = {
        asap: asap_2.asap,
        queue: queue_2.queue,
        animationFrame: animationFrame_1.animationFrame,
        async: async_14.async
    };
    exports.Scheduler = Scheduler;
    var Symbol = {
        rxSubscriber: rxSubscriber_4.rxSubscriber,
        observable: observable_4.observable,
        iterator: iterator_5.iterator
    };
    exports.Symbol = Symbol;
});
define("node_modules/suman-events/index", ["require", "exports", "assert"], function (require, exports, assert) {
    'use strict';
    var process = require('suman-browser-polyfills/modules/process');
    var global = require('suman-browser-polyfills/modules/global');
    var colors = require('colors/safe');
    function makeToString(val) {
        return function () {
            return val;
        };
    }
    var ev = Object.freeze({
        TEST_FILE_CHILD_PROCESS_EXITED: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('TEST_FILE_CHILD_PROCESS_EXITED')
        },
        RUNNER_EXIT_CODE: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_EXIT_CODE')
        },
        RUNNER_EXIT_SIGNAL: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_EXIT_SIGNAL')
        },
        RUNNER_HIT_DIRECTORY_BUT_NOT_RECURSIVE: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_HIT_DIRECTORY_BUT_NOT_RECURSIVE')
        },
        RUNNER_EXIT_CODE_IS_ZERO: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_EXIT_CODE_IS_ZERO')
        },
        RUNNER_TEST_PATHS_CONFIRMATION: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_TEST_PATHS_CONFIRMATION')
        },
        RUNNER_RESULTS_TABLE: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_RESULTS_TABLE')
        },
        RUNNER_RESULTS_TABLE_SORTED_BY_MILLIS: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_RESULTS_TABLE_SORTED_BY_MILLIS')
        },
        RUNNER_OVERALL_RESULTS_TABLE: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_OVERALL_RESULTS_TABLE')
        },
        RUNNER_STARTED: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_STARTED')
        },
        RUNNER_ENDED: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_ENDED')
        },
        RUNNER_EXIT_CODE_GREATER_THAN_ZERO: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_EXIT_CODE_GREATER_THAN_ZERO')
        },
        RUNNER_INITIAL_SET: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_INITIAL_SET')
        },
        RUNNER_OVERALL_SET: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_OVERALL_SET')
        },
        RUNNER_ASCII_LOGO: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('RUNNER_ASCII_LOGO')
        },
        USING_SERVER_MARKED_BY_HOSTNAME: {
            explanation: 'Using server marked by hostname, matched with a property on your "servers" property in your config.',
            toString: makeToString('USING_SERVER_MARKED_BY_HOSTNAME')
        },
        USING_FALLBACK_SERVER: {
            explanation: 'Using fallback server which is hardcoded in the suman project, with localhost and port 6969.',
            toString: makeToString('USING_FALLBACK_SERVER')
        },
        USING_DEFAULT_SERVER: {
            explanation: 'Using default server marked by "*default" on your servers property in your suman.conf.js file.',
            toString: makeToString('USING_DEFAULT_SERVER')
        },
        TEST_CASE_STUBBED: {
            explanation: 'Test case is stubbed.',
            toString: makeToString('TEST_CASE_STUBBED')
        },
        TEST_CASE_SKIPPED: {
            explanation: 'Test case is skipped.',
            toString: makeToString('TEST_CASE_SKIPPED')
        },
        TEST_CASE_PASS: {
            explanation: 'Test case has passed successfully.',
            toString: makeToString('TEST_CASE_PASS')
        },
        TEST_CASE_FAIL: {
            explanation: 'Test case has failed.',
            toString: makeToString('TEST_CASE_FAIL')
        },
        TEST_CASE_END: {
            explanation: 'Test case has ended (use TEST_CASE_PASS, TEST_CASE_STUBBED, etc, for specific status).',
            toString: makeToString('TEST_CASE_END')
        },
        FILENAME_DOES_NOT_MATCH_NONE: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('FILENAME_DOES_NOT_MATCH_NONE')
        },
        FILENAME_DOES_NOT_MATCH_ALL: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('FILENAME_DOES_NOT_MATCH_ALL')
        },
        FILENAME_DOES_NOT_MATCH_ANY: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('FILENAME_DOES_NOT_MATCH_ANY')
        },
        SUITE_SKIPPED: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('SUITE_SKIPPED')
        },
        SUITE_END: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('SUITE_END')
        },
        TEST_END: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('TEST_END')
        },
        TAP_COMPLETE: {
            explanation: 'TAP output is complete',
            toString: makeToString('TAP_COMPLETE')
        },
        FILE_IS_NOT_DOT_JS: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('FILE_IS_NOT_DOT_JS')
        },
        FATAL_TEST_ERROR: {
            explanation: 'runner is started, fires before any test child processes are started.',
            toString: makeToString('FATAL_TEST_ERROR')
        },
        USING_STANDARD_REPORTER: {
            explanation: 'A notification that suman is using the standard reporter.',
            toString: makeToString('USING_STANDARD_REPORTER')
        },
        USING_SQLITE_REPORTER: {
            explanation: 'A notification that suman is using the SQLite reporter.',
            toString: makeToString('USING_SQLITE_REPORTER')
        },
        ERRORS_ONLY_OPTION: {
            explanation: 'Errors-only option is set to true.',
            toString: makeToString('ERRORS_ONLY_OPTION')
        },
        SUMAN_VERSION: {
            explanation: 'The Suman version which is actually running on your system.',
            toString: makeToString('SUMAN_VERSION')
        },
        NODE_VERSION: {
            explanation: 'The Node.js version running in your environment.',
            toString: makeToString('NODE_VERSION')
        }
    });
    Object.keys(ev).forEach(function (k) {
        var e = ev[k];
        var toStr = String(e);
        assert(e.explanation.length > 20, colors.red(' => Please provide a more detailed explanation for the event (' + k + ').'));
        if (toStr !== k) {
            throw new Error(colors.red(' => Suman implementation error => toString() on events object is' +
                ' not expected value for key => "' + k + '",\ntoString() val is => ' + toStr));
        }
    });
    return ev;
});
