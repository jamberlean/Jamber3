/**
 * Custom Confirmation and Alert Modal for Jamber3
 * Replaces native confirm() and alert() dialogs to prevent window focus issues
 */
class ConfirmationModal {
    constructor() {
        this.modal = null;
        this.currentResolver = null;
        this.isAlertMode = false;
        this.createModal();
    }

    /**
     * Create the confirmation modal HTML structure
     */
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'modal confirmation-modal';
        modal.id = 'confirmationModal';
        
        modal.innerHTML = `
            <div class="modal-content confirmation-content">
                <div class="modal-header">
                    <h3 class="confirmation-title">Confirm Action</h3>
                </div>
                <div class="confirmation-body">
                    <p class="confirmation-message"></p>
                </div>
                <div class="confirmation-buttons">
                    <button class="btn-primary confirm-btn">Confirm</button>
                    <button class="btn-secondary cancel-btn">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;
        
        this.attachEventListeners();
    }

    /**
     * Attach event listeners to modal buttons
     */
    attachEventListeners() {
        const confirmBtn = this.modal.querySelector('.confirm-btn');
        const cancelBtn = this.modal.querySelector('.cancel-btn');
        
        confirmBtn.addEventListener('click', () => this.resolve(true));
        cancelBtn.addEventListener('click', () => this.resolve(false));
        
        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.resolve(false);
            }
        });
        
        // Close on click outside modal content
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.resolve(false);
            }
        });
    }

    /**
     * Show confirmation dialog
     * @param {string} message - The confirmation message
     * @param {string} title - Optional title (defaults to "Confirm Action")
     * @param {boolean} isAlert - If true, shows only OK button (alert mode)
     * @returns {Promise<boolean>} Promise that resolves to true if confirmed, false if cancelled
     */
    show(message, title = 'Confirm Action', isAlert = false) {
        return new Promise((resolve) => {
            this.currentResolver = resolve;
            this.isAlertMode = isAlert;
            
            // Set content
            this.modal.querySelector('.confirmation-title').textContent = title;
            this.modal.querySelector('.confirmation-message').innerHTML = message.replace(/\n/g, '<br>');
            
            // Configure buttons based on mode
            const cancelBtn = this.modal.querySelector('.cancel-btn');
            const confirmBtn = this.modal.querySelector('.confirm-btn');
            
            if (isAlert) {
                cancelBtn.style.display = 'none';
                confirmBtn.textContent = 'OK';
                confirmBtn.focus();
            } else {
                cancelBtn.style.display = 'inline-block';
                confirmBtn.textContent = 'Confirm';
            }
            
            // Show modal
            this.modal.style.display = 'block';
            
            // Focus appropriate button
            setTimeout(() => {
                if (isAlert) {
                    confirmBtn.focus();
                } else {
                    confirmBtn.focus();
                }
            }, 100);
        });
    }

    /**
     * Resolve the current promise and hide modal
     * @param {boolean} result - The result to resolve with
     */
    resolve(result) {
        if (this.currentResolver) {
            // For alert mode, always return true since there's no cancel option
            this.currentResolver(this.isAlertMode ? true : result);
            this.currentResolver = null;
        }
        
        this.isAlertMode = false;
        this.modal.style.display = 'none';
    }
}

// Create global instance
window.confirmationModal = new ConfirmationModal();

/**
 * Global function to replace native confirm()
 * @param {string} message - The confirmation message
 * @param {string} title - Optional title
 * @returns {Promise<boolean>} Promise that resolves to true if confirmed
 */
window.customConfirm = async (message, title) => {
    return await window.confirmationModal.show(message, title, false);
};

/**
 * Global function to replace native alert()
 * @param {string} message - The alert message
 * @param {string} title - Optional title
 * @returns {Promise<boolean>} Promise that resolves to true when OK is clicked
 */
window.customAlert = async (message, title = 'Notice') => {
    return await window.confirmationModal.show(message, title, true);
};