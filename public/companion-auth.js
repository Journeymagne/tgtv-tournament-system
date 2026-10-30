/* Shared field constraints for both presentations of the Companion account. */
(function () {
  'use strict';
  function setMode(form, mode) {
    const register = mode === 'register';
    const { name, password, confirmPassword } = form.elements;
    name.minLength = register ? 2 : 1;
    name.maxLength = register ? 24 : 254;
    password.minLength = register ? 6 : 1;
    password.maxLength = confirmPassword.maxLength = 256;
    password.autocomplete = register ? 'new-password' : 'current-password';
  }
  window.KTAuthForm = Object.freeze({ setMode });
})();
