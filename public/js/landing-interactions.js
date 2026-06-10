document.addEventListener('DOMContentLoaded', () => {
    // Micro-interactions and atmospheric effects
    document.querySelectorAll('button, a').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if(btn.classList.contains('gradient-primary')) {
                btn.style.filter = 'brightness(1.1)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.filter = 'brightness(1)';
        });
    });

    // Simple scroll reveal for cards
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('opacity-100', 'translate-y-0');
                entry.target.classList.remove('opacity-0', 'translate-y-8');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.glass').forEach(el => {
        el.classList.add('transition-all', 'duration-700', 'opacity-0', 'translate-y-8');
        observer.observe(el);
    });
});
