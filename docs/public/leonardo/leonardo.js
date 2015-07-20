
angular.module('leonardo', ['leonardo.templates', 'ngMockE2E'])
  .factory('configuration', configurationService)
  .factory('activeStatesStore', function(store) {
    return store.getNamespacedStore('active_states');
  })
  .factory('storage', storageService)
  .directive('activator', activatorDirective)
  .directive('windowBody', windowBodyDirective)
  /* wrap $httpbackend with a proxy in order to support delaying its responses
   * we are using the approach described in Endless Indirection:
   * https://endlessindirection.wordpress.com/2013/05/18/angularjs-delay-response-from-httpbackend/
   */
  .config(function($provide) {
    $provide.decorator('$httpBackend', function($delegate) {
      var proxy = function(method, url, data, callback, headers) {
        var interceptor = function() {
          var _this = this,
              _arguments = arguments;
          setTimeout(function() {
            callback.apply(_this, _arguments);
          }, proxy.delay || 0);
          proxy.delay = 0;
        };
        return $delegate.call(this, method, url, data, interceptor, headers);
      };
      for(var key in $delegate) {
        proxy[key] = $delegate[key];
      }
      proxy.setDelay = function(delay) {
        proxy.delay = delay;
      };
      return proxy;
    });
  });


angular.module('leonardo').factory('configuration', function(storage, $httpBackend) {
  var states = [];
  var responseHandlers = {};

  var upsertOption = function(state, name, active) {
    var _states = storage.getStates();
    _states[state] = {
      name: name,
      active: active
    };

    storage.setStates(_states);

    sync();
  };

  function fetchStates(){
    var activeStates = storage.getStates();
    var _states = states.map(state => angular.copy(state));

    _states.forEach(function(state) {
      let option = activeStates[state.name];
      state.active = !!option && option.active;
      state.activeOption = !!option ? state.options.find(_option => _option.name === option.name) : state.options[0];
    });

    return _states;
  }

  function deactivateAll() {
    var _states = storage.getStates();
    Object.keys(_states).forEach(function(stateKey) {
      _states[stateKey].active = false;
    });
    storage.setStates(_states);

    sync();
  }

  function findStateOption(name){
    return fetchStates().find(state => state.name === name).activeOption;
  }

  function sync(){
    fetchStates().forEach(function (state) {
      var option, responseHandler;
      if (state.url) {
        option = findStateOption(state.name);
        responseHandler = getResponseHandler(state);
        if (state.active) {
          responseHandler.respond(function () {
            $httpBackend.setDelay(option.delay);
            return [option.status, angular.isFunction(option.data) ? option.data() : option.data];
          });
        } else {
          responseHandler.passThrough();
        }
      }
    });
  }

  function getResponseHandler(state) {
    if (!responseHandlers[state.name]) {
      responseHandlers[state.name] = $httpBackend.when(state.verb || 'GET', new RegExp(state.url));
    }
    return responseHandlers[state.name];
  }

  return {
    //configured states todo doc
    states: states,
    //todo doc
    active_states_option: [],
    //todo doc
    upsertOption: upsertOption,
    //todo doc
    fetchStates: fetchStates,
    getState: function(name){
      var state = fetchStates().find(state => state.name === name);
      return (state && state.active && findStateOption(name)) || null;
    },
    addState: function(stateObj) {
      stateObj.options.forEach((option) => {
        this.upsert({
          state: stateObj.name,
          url: stateObj.url,
          verb: option.verb,
          name: option.name,
          status: option.status,
          data: option.data,
          delay: option.delay
        });
      });
    },
    addStates: function(statesArr) {
      statesArr.forEach((stateObj) => {
        this.addState(stateObj);
      });
    },
    //insert or replace an option by insert or updateing a state.
    upsert: function({ verb, state, name, url, status = 200, data = {}, delay = 0}){
      var defaultState = {};

      var defaultOption = {};

      if (!state) {
        console.log("cannot upsert - state is mandatory");
        return;
      }

      var stateItem = states.find(_state => _state.name === state) || defaultState;

      angular.extend(stateItem, {
        name: state,
        url: url || stateItem.url,
        verb: verb || stateItem.verb,
        options: stateItem.options || []
      });


      if (stateItem === defaultState) {
        states.push(stateItem);
      }

      var option = stateItem.options.find(_option => _option.name === name) || defaultOption;

      angular.extend(option, {
        name: name,
        status: status,
        data: data,
        delay: delay
      });

      if (option === defaultOption) {
        stateItem.options.push(option);
      }
      sync();
    },
    //todo doc
    upsertMany: function(items){
      items.forEach(item => this.upsert(item));
    },
    deactivateAll: deactivateAll
  };
});

angular.module('leonardo').factory('storage', function storageService() {
  var STATES_STORE_KEY = 'states';
  function getItem(key) {
    var item = localStorage.getItem(key);
    if (!item) {
      return null;
    }
    return angular.fromJson(item);
  }

  function setItem(key, data) {
    localStorage.setItem(key, angular.toJson(data));
  }

  function getStates() {
    return getItem(STATES_STORE_KEY) || {};
  }

  function setStates(states) {
    setItem(STATES_STORE_KEY, states);
  }

  return {
    getItem: getItem,
    setItem: setItem,
    setStates: setStates,
    getStates: getStates
  };
});

angular.module('leonardo').directive('activator', function activatorDirective($compile) {
  return {
    restrict: 'A',
    link: function(scope, elem) {
      var el = angular.element('<div ng-click="activate()" class="leonardo-activator"></div>');

      var win = angular.element([
      '<div class="leonardo-window">',
        '<div class="leonardo-header">Leonardo Configuration</div>',
          '<window-body></window-body>',
        '</div>',
      '</div>'
      ].join(''));

      $compile(el)(scope);
      $compile(win)(scope);

      elem.append(el);
      elem.append(win);

      win[0].addEventListener( 'webkitTransitionEnd', function() {
        if (!document.body.classList.contains('pull-top')){
          document.body.classList.add("pull-top-closed");
        }
      }, false );

      scope.activate = function(){
        if (!document.body.classList.contains('pull-top')) {
          document.body.classList.add('pull-top');
          document.body.classList.remove('pull-top-closed');
        }
        else {
          document.body.classList.remove('pull-top');
        }
      };
    }
  };
});