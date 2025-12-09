/**
 * Injects "Secured with EigenCloud" badge into the MkDocs header
 */
document.addEventListener('DOMContentLoaded', function() {
  // Find the header inner container
  const headerInner = document.querySelector('.md-header__inner');
  if (!headerInner) return;

  // Find the nav element in the header
  const headerNav = headerInner.querySelector('.md-header__source, .md-header__option');
  
  // Create the badge element
  const badge = document.createElement('a');
  badge.href = 'https://developers.eigencloud.xyz?utm_source=clout-cards';
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.className = 'eigencloud-badge';
  badge.title = 'Learn more about EigenCloud';
  
  badge.innerHTML = `
    <span class="eigencloud-badge-text">Secured with</span>
    <img src="/docs/assets/images/eigencloud-logo.png" alt="EigenCloud" class="eigencloud-badge-logo">
  `;
  
  // Insert the badge after the logo/title area
  const logo = headerInner.querySelector('.md-header__button.md-logo');
  if (logo && logo.parentNode) {
    logo.parentNode.insertBefore(badge, logo.nextSibling);
  } else {
    // Fallback: prepend to header inner
    headerInner.insertBefore(badge, headerInner.firstChild);
  }
});

