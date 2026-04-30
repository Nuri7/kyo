async function run() {
    try {
        const testImage = 'https://cors.eu.org/https://replicate.delivery/pbxt/aB1E5Pq3zB3VOKqV3RjW2XmS6hL1O5V8fF9H0/out-0.png';
        const imgResponse = await fetch(testImage);
        console.log("Status img:", imgResponse.status);
    } catch(e) {
        console.error("Error img:", e);
    }
}
run();
