const TYPE_LABELS = {
    'feat': { label: 'Features', icon: '✨', emoji: '🎉' },
    'fix': { label: 'Bug Fixes', icon: '🐛', emoji: '🔧' },
    'docs': { label: 'Documentation', icon: '📝', emoji: '📚' },
    'chore': { label: 'Chores & Maintenance', icon: '🔧', emoji: '⚙️' },
    'other': { label: 'Other Changes', icon: '📦', emoji: '📌' }
};

async function loadReleaseNotes() {
    try {
        const response = await fetch('release_notes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        displayMetadata(data);
        displayCommits(data);
        
    } catch (error) {
        console.error('Error loading release notes:', error);
        document.getElementById('metadata').innerHTML = `
            <div class="error">
                <strong>Error loading release notes:</strong> ${error.message}
            </div>
        `;
        document.getElementById('download-json').style.display = 'none';
    }
}

function displayMetadata(data) {
    const repoUrl = data.repository.url;
    const repoLink = repoUrl ? `<a href="${repoUrl}" target="_blank" style="color: #0366d6;">${data.repository.name}</a>` : data.repository.name;
    
    // Update page title with repository name
    document.getElementById('page-title').textContent = `${data.repository.name} - Release Notes`;
    
    document.getElementById('metadata').innerHTML = `
        <strong>Repository:</strong> ${repoLink} (${data.repository.branch}) | 
        <strong>Generated:</strong> ${data.generated_at}
    `;
}

function displaySummary(summary, commits) {
    const summaryEl = document.getElementById('summary');
    summaryEl.style.display = 'flex';
    
    // Build cards dynamically based on what types are in the summary
    const allKeys = Object.keys(summary).filter(k => k !== 'total');
    
    // Build timeline
    const timeline = buildTimeline(commits);
    
    // Build total card
    const totalCard = `
        <div class="summary-card total active" data-type="all">
            <span class="icon">📊</span>
            <span class="number">${summary.total}</span>
            <span class="label">Total Commits</span>
        </div>
    `;
    
    const summaryTop = `
        <div class="summary-top">
            ${totalCard}
            ${timeline}
        </div>
    `;
    
    // Build category cards for types with counts > 0
    const categoryCards = [];
    allKeys.forEach(key => {
        if (key !== 'total') {
            const value = summary[key];
            if (value && value > 0) {
                const typeInfo = TYPE_LABELS[key] || { label: key, icon: '📦' };
                categoryCards.push(`
                    <div class="summary-card ${key}" data-type="${key}">
                        <span class="icon">${typeInfo.icon}</span>
                        <span class="number">${value}</span>
                        <span class="label">${typeInfo.label}</span>
                    </div>
                `);
            }
        }
    });
    
    const categoriesSection = categoryCards.length > 0 ? `
        <div class="summary-categories">
            ${categoryCards.join('')}
        </div>
    ` : '';
    
    summaryEl.innerHTML = summaryTop + categoriesSection;
    
    // Add click handlers for filtering
    document.querySelectorAll('.summary-card').forEach(card => {
        card.addEventListener('click', function() {
            const filterType = this.getAttribute('data-type');
            filterCommitsByType(filterType);
            
            // Collapse all commits when showing all
            if (filterType === 'all') {
                collapseAllCommits();
            }
            
            // Update active state
            document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            // Deactivate timeline dots
            document.querySelectorAll('.timeline-commit').forEach(d => d.classList.remove('active'));
        });
    });
}

function buildTimeline(commits) {
    if (!commits || commits.length === 0) return '';
    
    // Get first and last commit timestamps
    const timestamps = commits.map(c => c.timestamp).sort((a, b) => a - b);
    const firstTime = timestamps[0];
    const lastTime = timestamps[timestamps.length - 1];
    const timeRange = lastTime - firstTime || 1; // Avoid division by zero
    
    // Build commit markers
    const markers = commits.map(commit => {
        const position = ((commit.timestamp - firstTime) / timeRange) * 100;
        const typeKey = (commit.type || 'other').toLowerCase();
        const title = `${commit.message_short} (${commit.date})`;
        return `<div class="timeline-commit type-${typeKey}" style="left: ${position}%" title="${title.replace(/"/g, '&quot;')}" data-commit-hash="${commit.hash}"></div>`;
    }).join('');
    
    // Build graduation marks (10 marks across the timeline)
    const graduations = [];
    for (let i = 0; i <= 10; i++) {
        const position = (i / 10) * 100;
        const timestamp = firstTime + (timeRange / 10) * i;
        const date = new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        graduations.push(`
            <div class="timeline-graduation" style="left: ${position}%">
                <div class="graduation-tick"></div>
                <div class="graduation-label">${date}</div>
            </div>
        `);
    }
    const graduationHTML = graduations.join('');
    
    // Format dates
    const firstDate = new Date(firstTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lastDate = new Date(lastTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const timelineHTML = `
        <div class="commit-timeline">
            <div class="timeline-label">Commit Timeline</div>
            <div class="timeline-track-container">
                <div class="timeline-track" id="timeline-track">
                    <div class="timeline-graduations">
                        ${graduationHTML}
                    </div>
                    ${markers}
                </div>
            </div>
            <div class="timeline-dates">
                <span>${firstDate}</span>
                <span>${lastDate}</span>
            </div>
            <div class="timeline-zoom">
                <span class="timeline-zoom-label">Zoom</span>
                <input type="range" class="timeline-zoom-slider" id="timeline-zoom-slider" min="1" max="10" step="0.5" value="1">
                <span class="timeline-zoom-value" id="timeline-zoom-value">1x</span>
            </div>
        </div>
    `;
    
    // Add click handlers after rendering
    setTimeout(() => {
        setupTimelineHandlers();
    }, 150);
    
    return timelineHTML;
}

function setupTimelineHandlers() {
    document.querySelectorAll('.timeline-commit').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const hash = dot.getAttribute('data-commit-hash');
            filterByCommitHash(hash);
            
            // Update timeline dot active state
            document.querySelectorAll('.timeline-commit').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        });
    });
    
    // Add zoom slider handler
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    const zoomValue = document.getElementById('timeline-zoom-value');
    const timelineTrack = document.getElementById('timeline-track');
    
    if (zoomSlider && zoomValue && timelineTrack) {
        // Set initial zoom
        const initialZoom = parseFloat(zoomSlider.value);
        timelineTrack.style.width = (initialZoom * 100) + '%';
        zoomValue.textContent = initialZoom + 'x';
        
        zoomSlider.addEventListener('input', (e) => {
            const zoom = parseFloat(e.target.value);
            const newWidth = (zoom * 100) + '%';
            zoomValue.textContent = zoom + 'x';
            timelineTrack.style.width = newWidth;
        });
    }
}

function collapseAllCommits() {
    document.querySelectorAll('.commit-body.expanded').forEach(body => {
        body.classList.remove('expanded');
        body.classList.add('collapsed');
    });
}

function filterByCommitHash(hash) {
    const commits = document.querySelectorAll('.commit-item');
    
    commits.forEach(commit => {
        const targetId = commit.getAttribute('data-target');
        if (targetId === `commit-${hash}`) {
            commit.style.display = 'block';
            // Auto-expand the commit details
            const body = document.getElementById(targetId);
            if (body && body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                body.classList.add('expanded');
            }
            // Scroll to it smoothly
            setTimeout(() => {
                commit.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            commit.style.display = 'none';
        }
    });
    
    // Update summary cards to deactivate all
    document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
}

function scrollToCommit(hash) {
    const commitItem = document.querySelector(`[data-target="commit-${hash}"]`);
    if (commitItem) {
        // Remove previous highlights
        document.querySelectorAll('.commit-item.highlight').forEach(item => {
            item.classList.remove('highlight');
        });
        
        // Scroll to commit
        commitItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Highlight commit
        commitItem.classList.add('highlight');
        
        // Expand commit details
        const targetId = commitItem.getAttribute('data-target');
        const body = document.getElementById(targetId);
        if (body && body.classList.contains('collapsed')) {
            body.classList.remove('collapsed');
            body.classList.add('expanded');
        }
    }
}

function filterCommitsByType(type) {
    const commits = document.querySelectorAll('.commit-item');
    const timelineDots = document.querySelectorAll('.timeline-commit');
    
    commits.forEach(commit => {
        if (type === 'all') {
            commit.style.display = 'block';
        } else {
            const commitType = commit.getAttribute('data-commit-type');
            commit.style.display = (commitType === type) ? 'block' : 'none';
        }
    });
    
    // Also filter timeline dots based on their type class
    timelineDots.forEach(dot => {
        dot.classList.remove('visible');
        dot.style.opacity = '1';
        
        if (type === 'all') {
            dot.style.display = 'block';
            dot.style.opacity = '1';
        } else {
            // Extract type from the dot's class (e.g., type-feat)
            const dotTypeClass = Array.from(dot.classList).find(c => c.startsWith('type-'));
            if (dotTypeClass) {
                const dotType = dotTypeClass.replace('type-', '');
                if (dotType === type) {
                    dot.style.display = 'block';
                    dot.style.opacity = '1';
                    dot.classList.add('visible');
                } else {
                    dot.style.opacity = '0.3';
                    dot.style.display = 'block';
                }
            }
        }
    });
}

function displayCommits(data) {
    const container = document.getElementById('releases-container');
    container.innerHTML = '';
    
    // Build a reliable grouping from commits using commit.type field
    const grouped = { feat: [], fix: [], docs: [], chore: [], other: [] };
    if (Array.isArray(data.commits)) {
        data.commits.forEach(c => {
            const t = (c.type || 'other').toLowerCase();
            if (grouped[t]) {
                grouped[t].push(c);
            } else {
                grouped.other.push(c);
            }
        });
    }

    // Recompute summary from the regrouped data using correct type keys
    const summary = {
        total: Array.isArray(data.commits) ? data.commits.length : 0,
        feat: (grouped.feat || []).length,
        fix: (grouped.fix || []).length,
        docs: (grouped.docs || []).length,
        chore: (grouped.chore || []).length,
        other: (grouped.other || []).length,
    };
    displaySummary(summary, data.commits);
    
    // Display all commits in original JSON order with type badges
    if (Array.isArray(data.commits) && data.commits.length > 0) {
        container.innerHTML = `
            <ul class="commit-list">
                ${data.commits.map(commit => createCommitHTML(commit, data.repository.url)).join('')}
            </ul>
        `;
    } else {
        container.innerHTML = '<div class="empty-section">No commits found.</div>';
    }

    setupToggleHandlers();
}

function createCommitHTML(commit, repoUrl) {
    const commitUrl = repoUrl ? `${repoUrl}/commit/${commit.hash}` : '#';
    const summaryText = escapeHtml(commit.message_short || (commit.message.split('\n')[0] || ''));
    const fullMessage = escapeHtml(commit.message);
    const bodyId = `commit-${commit.hash}`;
    const isRenovate = /renovate/i.test(commit.author || '');
    const commitClass = isRenovate ? 'commit-item commit-renovate' : 'commit-item';
    const typeKey = (commit.type || 'other').toLowerCase();
    const typeInfo = TYPE_LABELS[typeKey] || { label: typeKey };
    const typeClass = `type-${typeKey}`;
    
    return `
        <li class="${commitClass}" data-target="${bodyId}" data-commit-type="${typeKey}">
            <div class="commit-header">
                <div class="commit-header-left">
                    <a href="${commitUrl}" target="_blank" class="commit-hash" title="${commit.hash}">
                        ${commit.short_hash}
                    </a>
                    <span class="commit-type ${typeClass}" title="${typeInfo.label}">${typeInfo.label}</span>
                </div>
                <span class="commit-date">${commit.date}</span>
            </div>
            <div class="commit-summary">${summaryText}</div>
            <div class="commit-body collapsed" id="${bodyId}">
                <div class="commit-message">${fullMessage}</div>
                <div class="commit-footer">
                    <span class="commit-author">by ${escapeHtml(commit.author)}</span>
                    <div class="commit-stats">
                        <span class="stat additions" title="Insertions">+${commit.insertions}</span>
                        <span class="stat deletions" title="Deletions">-${commit.deletions}</span>
                        <span class="stat" title="Files changed">📄 ${commit.files_changed}</span>
                    </div>
                </div>
            </div>
        </li>
    `;
}

function setupToggleHandlers() {
    const items = document.querySelectorAll('.commit-item');
    items.forEach(item => {
        item.addEventListener('click', (event) => {
            if (event.target.closest('a.commit-hash')) {
                return; // allow link clicks without toggling
            }

            const targetId = item.getAttribute('data-target');
            const body = document.getElementById(targetId);
            if (!body) return;

            const isCollapsed = body.classList.contains('collapsed');
            body.classList.toggle('collapsed', !isCollapsed);
            body.classList.toggle('expanded', isCollapsed);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadReleaseNotes();