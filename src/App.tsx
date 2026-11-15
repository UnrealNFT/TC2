                  <iframe
                  key={previewKey}
                  src={`http://localhost:4269/api/preview/${previewEntry}?base=${encodeURIComponent(activePath)}`}
                  style={{ flex: 1, border: 'none', backgroundColor: '#fff' }}
                  title="preview"
                />