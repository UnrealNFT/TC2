import { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText('');

    // Simulate agent response
    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        const responseText = `Réponse automatique pour : ${newMessage.text}`;
        const agentMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: responseText,
          sender: 'agent',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, agentMessage]);
        setIsTyping(false);
      }, 1000);
    }, 500);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat avec l'agent</h2>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.sender === 'user' ? 'user-message' : 'agent-message'}`}
          >
            <p>{msg.text}</p>
            <small>{msg.timestamp.toLocaleTimeString()}</small>
          </div>
        ))}
        {isTyping && (
          <div className="typing-indicator">L'agent écrit...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Écrivez votre message..."
        />
        <button onClick={handleSend} disabled={!inputText.trim()}>
          Envoyer
        </button>
      </div>
    </div>
  );
};

export default Chat;