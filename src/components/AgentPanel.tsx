          <span style={{ ...styles.badge, backgroundColor: running ? 'var(--tc-primary)' : 'var(--tc-bg-elevated)', color: running ? 'var(--tc-bg)' : 'var(--tc-text-muted)' }}>
            {running ? `C${Math.ceil(tourCount / 10)} T${tourCount}` : 'idle'}
          </span>
