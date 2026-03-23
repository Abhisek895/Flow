function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    const iconClass = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    
    toast.innerHTML = `
        <i class="ph ${iconClass}" style="font-size: 1.5rem;"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function showModal(title, bodyHtml, confirmText, onConfirm, cancelText = 'Cancel') {
    // Check if modal container exists
    let backdrop = document.getElementById('global-modal');
    if (backdrop) backdrop.remove();

    backdrop = document.createElement('div');
    backdrop.id = 'global-modal';
    backdrop.className = 'modal-backdrop';
    
    backdrop.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <button class="modal-close" id="modal-close-btn">
                    <i class="ph ph-x"></i>
                </button>
            </div>
            <div class="modal-body">
                ${bodyHtml}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="modal-cancel-btn">${cancelText}</button>
                <button class="btn btn-danger" id="modal-confirm-btn">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);

    // Close logic
    const close = () => {
        backdrop.classList.remove('show');
        setTimeout(() => backdrop.remove(), 200);
    };

    document.getElementById('modal-close-btn').addEventListener('click', close);
    document.getElementById('modal-cancel-btn').addEventListener('click', close);
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
        if (onConfirm()) {
            close();
        }
    });

    // Show with animation
    setTimeout(() => backdrop.classList.add('show'), 10);
}

// Generate an Avatar with initials
function generateAvatar(username) {
    if (!username) return 'U';
    return username.charAt(0).toUpperCase();
}
