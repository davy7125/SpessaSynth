
const STROKE_COLOR = "#000";
const PRESSED_EFFECT_OPACITY = 0.5;

/**
 * @param notesToDraw {NoteToRender[]}
 * @param drawingContext {CanvasRenderingContext2D}
 */
export function drawNotes(notesToDraw, drawingContext)
{
    // render the pressed effect first
    notesToDraw.forEach(n => {
        if(n.pressedProgress === 0)
        {
            return;
        }
        drawingContext.fillStyle = n.color;
        const effectStrength = n.pressedProgress * n.velocity;
        drawingContext.globalAlpha = PRESSED_EFFECT_OPACITY * effectStrength;
        drawingContext.fillRect(n.xPos + n.width, n.yPos, n.width * effectStrength, n.height);
        drawingContext.fillRect(n.xPos - n.width * effectStrength, n.yPos, n.width * effectStrength, n.height);
        drawingContext.globalAlpha = 1;
    })

    notesToDraw.forEach(n => {
        // save and change color
        drawingContext.fillStyle = n.color;
        drawingContext.save();

        // draw the rectangle
        drawingContext.translate(n.xPos, n.yPos);
        drawingContext.fillRect(0, 0, n.width, n.height);
        drawingContext.restore();

        // draw the outline
        drawingContext.strokeStyle = STROKE_COLOR;
        drawingContext.lineWidth = n.stroke;
        drawingContext.strokeRect(n.xPos, n.yPos, n.width, n.height);
    })
}