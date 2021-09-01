'use strict';

const {
  Assertion,
  constants: {
    Permissions,
  },
  errors: {
    InvalidInput,
  },
} = require('@funnelytics/utilities');

/**
 * Configures PermissionEnforcer.
 */
class PermissionEnforcerConfig {
  /**
   * @param {Array[String]} requiredPermissions | Permissions to check against.
   * @param {Function} handlerPromise | What to run when the conflict is detected
   * @param {Boolean} isOnlyRunOnChange | If true, only run the handlerPromise if there is an initial
   * check done for the permissions and there is a change between the initial state and the final state. If
   * false, will perform the handlerPromise whenever requiredPermissions doesn't meet requirement (based on
   * isRunOnAbsent or isRunOnPresent). If true, an initial state will have to be enforced, or PermissionEnforcer
   * will throw an error.
   * @param {Boolean} isRunOnAbsent | If true, run the handlerPromise when requiredPermissions are absent.
   * Must be true if isRunOnPresent is false, and false if isRunOnPresent is true.
   * @param {Boolean} isRunOnPresent | If true, run the handlerPromise when requiredPermissions are present.
   * Must be true if isRunOnAbsent is false, and false if isRunOnAbsent is true.
   * @param {String?} optionReturnValueKey | enforce() returns passed options key value for key optionReturnValueKey,
   * if it is not null.
   * @param {Any} defaultReturnValue | if optionReturnValueKey is null or that key is missing on options passed to enforce,
   * this value is returned by default from enforce().
   */
  constructor({
    requiredPermissions,
    handlerPromise,
    isOnlyRunOnChange = true,
    isRunOnAbsent = false,
    isRunOnPresent = false,
    optionReturnValueKey = null,
    defaultReturnValue = false,
  }) {
    this.setRequiredPermissions(requiredPermissions);
    this.setIsOnlyRunOnChange(isOnlyRunOnChange);
    this.setWhenRun({
      isRunOnPresent,
      isRunOnAbsent,
    });
    this.setHandlerPromise(handlerPromise);
    this.setOptionReturnValueKey(optionReturnValueKey);
    this.setDefaultReturnValue(defaultReturnValue);
  }

  setRequiredPermissions(requiredPermissions) {
    Assertion.arrayOfStrings(requiredPermissions, { allowEmptyArray: false });
    requiredPermissions.forEach(permission => {
      Assertion.validString(permission, Permissions.ALL_PERMISSIONS);
    });

    this._requiredPermissions = requiredPermissions;
  }

  setIsOnlyRunOnChange(isOnlyRunOnChange) {
    Assertion.boolean(isOnlyRunOnChange);

    this._isOnlyRunOnChange = isOnlyRunOnChange;
  }

  setWhenRun({
    isRunOnPresent,
    isRunOnAbsent,
  }) {
    Assertion.boolean(isRunOnPresent);
    Assertion.boolean(isRunOnAbsent);
    if ((isRunOnPresent && isRunOnAbsent) || (!isRunOnPresent && !isRunOnAbsent)) {
      // eslint-disable-next-line max-len
      throw new InvalidInput(`Either isRunOnAbsent or isRunOnPresent must be true, but not both. Got isRunOnPresent: ${isRunOnPresent}, isRunOnAbsent: ${isRunOnAbsent}`);
    }

    this._isRunOnPresent = isRunOnPresent;
    this._isRunOnAbsent = isRunOnAbsent;
  }

  setHandlerPromise(handlerPromise) {
    Assertion.function(handlerPromise);

    this._handlerPromise = handlerPromise;
  }

  setOptionReturnValueKey(optionReturnValueKey) {
    Assertion.string(optionReturnValueKey, { allowEmpty: false, allowNull: true });

    this._optionReturnValueKey = optionReturnValueKey;
  }

  setDefaultReturnValue(defaultReturnValue) {
    this._defaultReturnValue = defaultReturnValue;
  }

  getRequiredPermissions() {
    return this._requiredPermissions;
  }

  isOnlyRunOnChange() {
    return this._isOnlyRunOnChange;
  }

  isRunOnAbsent() {
    return this._isRunOnAbsent;
  }

  isRunOnPresent() {
    return this._isRunOnPresent;
  }

  getHandlerPromise() {
    return this._handlerPromise;
  }

  getOptionReturnValueKey() {
    return this._optionReturnValueKey;
  }

  hasOptionReturnValueKey() {
    return this.getOptionReturnValueKey() !== null;
  }

  getDefaultReturnValue() {
    return this._defaultReturnValue;
  }
}

module.exports = PermissionEnforcerConfig;
