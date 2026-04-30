const token = 'r8_7StOkfCBWD5J2AeRavTGUjsmwwtN2981xYsij';
const prompt = "Professional product photography of 'Strawberry Cold Foam Matcha' drink. Sweet, vibrant, and incredibly foamy. Professional product photography, studio lighting, clean white background, high-end café menu photo, 4K quality, no text or labels. On a clean, elegant surface with soft natural lighting. In a modern, clear glass. Japanese café aesthetic, KYŌ KLUB brand. No text, no labels, no watermarks, no human hands.";

async function run() {
    console.log("Starting generation...");
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-pro/predictions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Prefer': 'wait'
        },
        body: JSON.stringify({
            input: {
                prompt: prompt,
                aspect_ratio: "3:4",
                output_format: "png"
            }
        })
    });
    
    let pred = await createRes.json();
    console.log("Initial status:", pred.status);
    
    while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
        await new Promise(r => setTimeout(r, 1500));
        const pollRes = await fetch(pred.urls.get, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        pred = await pollRes.json();
        console.log("Polling...", pred.status);
    }
    
    if (pred.status === "succeeded") {
        console.log("Success! Image URL:", pred.output);
    } else {
        console.error("Failed:", pred.error);
    }
}
run();
