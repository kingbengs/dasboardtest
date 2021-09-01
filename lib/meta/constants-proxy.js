const _ = require('lodash');

/**
 * An attempt to prevent such errors from being swallowed in catch() expressions.
 * Can still find the location of the error in the call stack.
 */
function throwUncatchableError(errorMessage) {
  // Stack trace required to be able to see where bad use of enumerated constant is located.
  console.trace(); // eslint-disable-line no-console
  setTimeout(() => {
    throw new Error(errorMessage);
  });
}

function constantsProxy(enumObject) {
  const mustEnforce = process.env.ENFORCE_PROXY === 'true';

  /**
   * Throw errors when a property that doesn't exist on enumObject is being
   * accessed. This makes development much easier.
   */
  if (mustEnforce) {
    return new Proxy(Object.freeze(enumObject), {
      get(target, property) {
        const returnValue = target[property];
        // length is accessed in some lodash methods so we need to excuse it
        if (returnValue === undefined && property !== 'length') {
          const availableProperties = `\n${(_.keys(target)).join('\n')}`;
          throwUncatchableError(`Attempted to access undefined property ${property} on enum object. Here is a list of available properties on this object:
          ${availableProperties}`);
        }
        return returnValue;
      },
    });
  }
  return Object.freeze(enumObject);
}

/**
 * Use this when making a constants proxy that can be used in development
 */
module.exports = constantsProxy;
