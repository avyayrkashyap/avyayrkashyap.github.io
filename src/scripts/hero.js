const leftWords = ["Building", "Designing", "Crafting", "Shaping"];
const rightWords = ["Confidence.", "Clarity.", "Trust.", "Intention."];

const el = document.getElementById('typewriter');

if (el) {
    let lastLeft = "Building";
    let lastRight = "Confidence.";
    let currentPhrase = `${lastLeft} for ${lastRight}`;
    let charIdx = 0;
    let isDeleting = false;

    function typeWriter() {
        if (isDeleting) {
            el.textContent = currentPhrase.substring(0, charIdx - 1);
            charIdx--;
        } else {
            el.textContent = currentPhrase.substring(0, charIdx + 1);
            charIdx++;
        }

        let typeSpeed = isDeleting ? 25 : Math.random() * 70 + 40;

        if (!isDeleting && charIdx === currentPhrase.length) {
            typeSpeed = 2500;
            isDeleting = true;
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;

            let randomLeft, randomRight;
            do {
                randomLeft = leftWords[Math.floor(Math.random() * leftWords.length)];
            } while (randomLeft === lastLeft);

            do {
                randomRight = rightWords[Math.floor(Math.random() * rightWords.length)];
            } while (randomRight === lastRight);

            lastLeft = randomLeft;
            lastRight = randomRight;
            currentPhrase = `${randomLeft} for ${randomRight}`;

            typeSpeed = 500;
        }

        setTimeout(typeWriter, typeSpeed);
    }

    setTimeout(typeWriter, 300);
}

