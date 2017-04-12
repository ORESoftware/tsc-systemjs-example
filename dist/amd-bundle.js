define("freeze-existing", ["require", "exports"], function (require, exports) {
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
define("index", ["require", "exports"], function (require, exports) {
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
define("make-test-suite", ["require", "exports"], function (require, exports) {
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
define("cli-commands/install-global-deps", ["require", "exports"], function (require, exports) {
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
define("cli-commands/run-diagnostics", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-after-each", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-after", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-before-each", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-before", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-describe", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-inject", ["require", "exports"], function (require, exports) {
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
define("test-suite-methods/make-it", ["require", "exports"], function (require, exports) {
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
