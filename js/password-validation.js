document.addEventListener('DOMContentLoaded', function () {
    const passwordInput = document.getElementById('password');
    const lengthReq = document.getElementById('length');
    const uppercaseReq = document.getElementById('uppercase');
    const numberReq = document.getElementById('number');
    const specialReq = document.getElementById('special');

    if (passwordInput) {
        passwordInput.addEventListener('input', function () {
            const val = passwordInput.value;

            // Length check
            if (val.length >= 8) {
                lengthReq.className = 'valid';
                lengthReq.innerHTML = '✔ At least 8 characters long';
            } else {
                lengthReq.className = 'invalid';
                lengthReq.innerHTML = '✘ At least 8 characters long';
            }

            // Uppercase & Lowercase check
            if (/[A-Z]/.test(val) && /[a-z]/.test(val)) {
                uppercaseReq.className = 'valid';
                uppercaseReq.innerHTML = '✔ Uppercase and lowercase letters';
            } else {
                uppercaseReq.className = 'invalid';
                uppercaseReq.innerHTML = '✘ Uppercase and lowercase letters';
            }

            // Number check
            if (/[0-9]/.test(val)) {
                numberReq.className = 'valid';
                numberReq.innerHTML = '✔ At least one number';
            } else {
                numberReq.className = 'invalid';
                numberReq.innerHTML = '✘ At least one number';
            }

            // Special character check
            if (/[\W_]/.test(val)) {
                specialReq.className = 'valid';
                specialReq.innerHTML = '✔ At least one special character (e.g., @, !, #)';
            } else {
                specialReq.className = 'invalid';
                specialReq.innerHTML = '✘ At least one special character (e.g., @, !, #)';
            }
        });
    }
});