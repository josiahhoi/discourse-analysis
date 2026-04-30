/**
 * Initial startup logic for Discourse Analysis
 * Handles theme initialization and global error reporting
 */

(function() {
    // Prevent Flash of Dark Mode (FOUC)
    const saved = localStorage.getItem('biblebracket_theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', '');
    } else {
        // Match System Theme or Time of Day fallback
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemDark) {
            document.documentElement.setAttribute('data-theme', '');
        } else {
            const hour = new Date().getHours();
            if (hour >= 7 && hour < 19) document.documentElement.setAttribute('data-theme', 'light');
            else document.documentElement.setAttribute('data-theme', '');
        }
    }

    // Global error handler
    window.onerror = function(msg, src, line, col, err) {
        console.error('[DA Error]', msg, 'at', src + ':' + line + ':' + col, err);
        const el = document.createElement('div');
        el.className = 'status error';
        el.textContent = '\u26a0 Error: ' + msg;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 500);
        }, 5000);
    };

    window.onunhandledrejection = function(e) {
        console.error('[DA Unhandled Rejection]', e.reason);
    };
})();
