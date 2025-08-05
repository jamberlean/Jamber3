const fs = require('fs');

// Create a simple 32x32 ICO file with basic icon data
// This creates a minimal working ICO file for Windows
function createSimpleIcon() {
    // ICO header
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // Reserved, must be 0
    header.writeUInt16LE(1, 2); // Image type: 1 for ICO
    header.writeUInt16LE(1, 4); // Number of images in file
    
    // Icon directory entry
    const dirEntry = Buffer.alloc(16);
    dirEntry.writeUInt8(32, 0);  // Width (32 pixels)
    dirEntry.writeUInt8(32, 1);  // Height (32 pixels)
    dirEntry.writeUInt8(0, 2);   // Color palette size (0 for no palette)
    dirEntry.writeUInt8(0, 3);   // Reserved
    dirEntry.writeUInt16LE(1, 4); // Color planes
    dirEntry.writeUInt16LE(32, 6); // Bits per pixel
    dirEntry.writeUInt32LE(2216, 8); // Size of image data
    dirEntry.writeUInt32LE(22, 12); // Offset to image data
    
    // Create a simple 32x32 bitmap (minimal working icon)
    // BMP header for embedded bitmap
    const bmpHeader = Buffer.alloc(40);
    bmpHeader.writeUInt32LE(40, 0); // Header size
    bmpHeader.writeInt32LE(32, 4);  // Width
    bmpHeader.writeInt32LE(64, 8);  // Height (doubled for ICO format)
    bmpHeader.writeUInt16LE(1, 12); // Color planes
    bmpHeader.writeUInt16LE(32, 14); // Bits per pixel
    bmpHeader.writeUInt32LE(0, 16); // Compression
    bmpHeader.writeUInt32LE(4096, 20); // Image size
    bmpHeader.writeInt32LE(0, 24); // X pixels per meter
    bmpHeader.writeInt32LE(0, 28); // Y pixels per meter
    bmpHeader.writeUInt32LE(0, 32); // Colors used
    bmpHeader.writeUInt32LE(0, 36); // Colors important
    
    // Create pixel data (32x32 BGRA format)
    const pixelData = Buffer.alloc(32 * 32 * 4); // 4096 bytes
    
    // Fill with a simple pattern (blue background with guitar-like shape)
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const idx = (y * 32 + x) * 4;
            
            // Create a simple guitar-like icon
            const centerX = 16, centerY = 16;
            const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            
            if (distFromCenter < 15) {
                // Background circle - blue
                pixelData[idx] = 219; // B
                pixelData[idx + 1] = 152; // G
                pixelData[idx + 2] = 52; // R
                pixelData[idx + 3] = 255; // A
                
                // Guitar body shape
                if (x >= 12 && x <= 20 && y >= 18 && y <= 28) {
                    pixelData[idx] = 19; // B - brown
                    pixelData[idx + 1] = 69; // G
                    pixelData[idx + 2] = 139; // R
                    pixelData[idx + 3] = 255; // A
                }
                
                // Guitar neck
                if (x >= 14 && x <= 18 && y >= 8 && y <= 18) {
                    pixelData[idx] = 30; // B - lighter brown
                    pixelData[idx + 1] = 105; // G
                    pixelData[idx + 2] = 210; // R
                    pixelData[idx + 3] = 255; // A
                }
                
                // Sound hole
                if (distFromCenter < 3 && y >= 18 && y <= 24) {
                    pixelData[idx] = 0; // B - black
                    pixelData[idx + 1] = 0; // G
                    pixelData[idx + 2] = 0; // R
                    pixelData[idx + 3] = 255; // A
                }
            } else {
                // Transparent outside
                pixelData[idx] = 0;
                pixelData[idx + 1] = 0;
                pixelData[idx + 2] = 0;
                pixelData[idx + 3] = 0;
            }
        }
    }
    
    // AND mask (32x32 bits = 128 bytes, all zeros for no masking)
    const andMask = Buffer.alloc(128, 0);
    
    // Combine all parts
    const iconData = Buffer.concat([header, dirEntry, bmpHeader, pixelData, andMask]);
    
    return iconData;
}

// Create and save the icon
const iconData = createSimpleIcon();
fs.writeFileSync('./assets/icon.ico', iconData);
console.log('Icon created: assets/icon.ico');