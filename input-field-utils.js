/**
 * Input Field Utilities for Jamber3
 * Provides safe event listener management and input state preservation
 * to prevent input field locking issues
 */

/**
 * ElementListenerManager - Safe event listener management without DOM element replacement
 */
class ElementListenerManager {
    constructor() {
        // Use WeakMap to avoid memory leaks - automatically cleaned up when elements are removed
        this.listeners = new WeakMap();
    }
    
    /**
     * Safely add an event listener, removing any existing listener for the same event
     * @param {Element} element - DOM element to attach listener to
     * @param {string} event - Event type (e.g., 'input', 'click')
     * @param {Function} handler - Event handler function
     * @param {Object} options - Optional event listener options
     */
    safeAddListener(element, event, handler, options = {}) {
        if (!element || !event || !handler) return;
        
        // Remove existing listener for this event type if it exists
        this.removeListener(element, event);
        
        // Add new listener
        element.addEventListener(event, handler, options);
        
        // Track the listener for future removal
        if (!this.listeners.has(element)) {
            this.listeners.set(element, new Map());
        }
        this.listeners.get(element).set(event, { handler, options });
    }
    
    /**
     * Remove event listener for specific event type
     * @param {Element} element - DOM element
     * @param {string} event - Event type to remove
     */
    removeListener(element, event) {
        if (!element || !event) return;
        
        const elementListeners = this.listeners.get(element);
        if (elementListeners && elementListeners.has(event)) {
            const { handler, options } = elementListeners.get(event);
            element.removeEventListener(event, handler, options);
            elementListeners.delete(event);
            
            // Clean up empty maps
            if (elementListeners.size === 0) {
                this.listeners.delete(element);
            }
        }
    }
    
    /**
     * Remove all event listeners from an element
     * @param {Element} element - DOM element
     */
    removeAllListeners(element) {
        if (!element) return;
        
        const elementListeners = this.listeners.get(element);
        if (elementListeners) {
            for (const [event, { handler, options }] of elementListeners) {
                element.removeEventListener(event, handler, options);
            }
            this.listeners.delete(element);
        }
    }
}

/**
 * InputStateManager - Preserve and restore input field states during DOM manipulations
 */
class InputStateManager {
    /**
     * Preserve input states and execute callback, then restore states
     * @param {Function} callback - Function to execute while preserving input states
     * @param {string} selector - CSS selector for input elements (default: all text inputs and textareas)
     */
    static preserveInputState(callback, selector = 'input[type="text"], textarea') {
        if (!callback) return;
        
        // Capture current states of all input fields
        const inputs = document.querySelectorAll(selector);
        const states = Array.from(inputs).map(input => ({
            element: input,
            id: input.id,
            value: input.value,
            selectionStart: input.selectionStart,
            selectionEnd: input.selectionEnd,
            focused: document.activeElement === input,
            disabled: input.disabled,
            readOnly: input.readOnly
        }));
        
        // Execute the callback
        try {
            callback();
        } catch (error) {
            console.error('Error in preserveInputState callback:', error);
        }
        
        // Restore states after DOM manipulation (use setTimeout to ensure DOM changes are complete)
        setTimeout(() => {
            states.forEach(state => {
                let element = state.element;
                
                // If element was replaced, try to find it by ID
                if (!document.contains(element) && state.id) {
                    element = document.getElementById(state.id);
                }
                
                if (element && document.contains(element)) {
                    try {
                        // Restore basic properties
                        if (element.value !== state.value) {
                            element.value = state.value;
                        }
                        
                        // Restore focus and selection
                        if (state.focused && document.activeElement !== element) {
                            element.focus();
                            
                            // Restore text selection if the element supports it
                            if (typeof element.setSelectionRange === 'function' && 
                                state.selectionStart !== null && 
                                state.selectionEnd !== null) {
                                element.setSelectionRange(state.selectionStart, state.selectionEnd);
                            }
                        }
                        
                        // Ensure element is not disabled or readonly unless it was originally
                        if (!state.disabled && element.disabled) {
                            element.disabled = false;
                            element.removeAttribute('disabled');
                        }
                        if (!state.readOnly && element.readOnly) {
                            element.readOnly = false;
                            element.removeAttribute('readonly');
                        }
                        
                    } catch (error) {
                        console.error('Error restoring input state:', error, { element: state.element, id: state.id });
                    }
                }
            });
        }, 0);
    }
    
    /**
     * Ensure an input element is interactive (not disabled or readonly)
     * @param {Element} element - Input element to make interactive
     */
    static ensureInteractive(element) {
        if (!element) return;
        
        try {
            element.disabled = false;
            element.readOnly = false;
            element.removeAttribute('disabled');
            element.removeAttribute('readonly');
            
            // Ensure CSS doesn't block interaction
            if (element.style.pointerEvents === 'none') {
                element.style.pointerEvents = 'auto';
            }
        } catch (error) {
            console.error('Error making input interactive:', error);
        }
    }
}

/**
 * SafeEventHandling - Utility functions for safer event handling
 */
class SafeEventHandling {
    /**
     * Create a safer mousedown handler that only stops propagation when necessary
     * @param {Function} customHandler - Optional custom handler to run
     * @returns {Function} Event handler function
     */
    static createSafeMousedownHandler(customHandler) {
        return (e) => {
            try {
                // Only stop propagation in specific cases where we need to prevent conflicts
                const target = e.target;
                const preventPropagation = 
                    target.closest('.draggable-area') || 
                    target.closest('.modal-drag-handle') ||
                    target.closest('.window-controls');
                
                if (preventPropagation) {
                    e.stopPropagation();
                }
                
                // Run custom handler if provided
                if (customHandler) {
                    customHandler(e);
                }
            } catch (error) {
                console.error('Error in safe mousedown handler:', error);
            }
        };
    }
    
    /**
     * Create a safer focus handler that preserves native browser behavior
     * @param {Function} customHandler - Optional custom handler to run
     * @returns {Function} Event handler function
     */
    static createSafeFocusHandler(customHandler) {
        return (e) => {
            try {
                // Allow native browser focus behavior - don't stop propagation
                // Only run custom logic if provided
                if (customHandler) {
                    customHandler(e);
                }
            } catch (error) {
                console.error('Error in safe focus handler:', error);
            }
        };
    }
}

// Create global instances for use throughout the application
window.ElementListenerManager = ElementListenerManager;
window.InputStateManager = InputStateManager;
window.SafeEventHandling = SafeEventHandling;

// Create global instance of the listener manager
window.globalListenerManager = new ElementListenerManager();

console.log('Input field utilities loaded successfully');