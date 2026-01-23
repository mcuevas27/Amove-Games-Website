// DevCardUI.js

let cardContainer = null;
let currentTimeout = null;

export function initCardUI(container) {
    // Create the overlay container absolute in the relative parent
    cardContainer = document.createElement('div');
    cardContainer.id = 'dev-card-overlay';
    cardContainer.className = 'dev-card-wrapper hidden';
    container.appendChild(cardContainer);
}

export function showDevCard(data) {
    const container = document.getElementById('devs-map-container'); // Corrected ID
    // Or simpler: Just find or create #dev-unit-card
    let card = document.getElementById('dev-unit-card');
    
    if (!card) {
        card = document.createElement('div');
        card.id = 'dev-unit-card';
        card.className = 'dev-card';
        // Append to the section container so it is positioned relative to the canvas
        if (container) container.appendChild(card);
        else document.body.appendChild(card); // Fallback
    }

    // Populate
    card.innerHTML = `
        <div class="dev-card-header">
            <div class="dev-img-container" style="border-color: ${data.color}">
                <img src="${data.img}" alt="${data.name}" class="dev-img">
            </div>
            <div class="dev-header-text">
                <h3 style="color: ${data.color}">${data.name}</h3>
                <span class="dev-role">${data.role}</span>
            </div>
        </div>
        <div class="dev-stats">
            ${data.stats.map(s => `
                <div class="stat-row">
                    <span class="stat-label">${s.label}</span>
                    <div class="stat-bar-bg">
                        <div class="stat-bar-fill" style="width: 0%"></div> 
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Show
    card.classList.add('visible');

    // Animate Bars (after slight delay for DOM paint)
    setTimeout(() => {
        const fills = card.querySelectorAll('.stat-bar-fill');
        fills.forEach((fill, i) => {
            fill.style.width = data.stats[i].value + '%';
            fill.style.backgroundColor = data.color;
        });
    }, 50);
}

export function hideDevCard() {
    const card = document.getElementById('dev-unit-card');
    if (card) {
        card.classList.remove('visible');
    }
}
