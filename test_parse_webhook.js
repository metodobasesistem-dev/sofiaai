function parse(data) {
  const messageObj = data.messages?.[0] || data.message || data;
  
  // Extrair a chave (onde fica o remoteJid, fromMe, id)
  const key = messageObj.key || data.key;
  
  // Extrair o conteúdo da mensagem (conversation, extendedTextMessage, etc)
  const messageContent = messageObj.message || messageObj;
  
  if (!messageContent || key?.fromMe) return null;

  const remoteJid = key.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return null;

  return { remoteJid, text: messageContent.conversation, messageId: key.id };
}

console.log("V1 Array:", parse({ messages: [{ key: { remoteJid: "a@s", id: "123" }, message: { conversation: "Hello" } }] }));
console.log("V2 Flattened:", parse({ key: { remoteJid: "b@s", id: "123" }, message: { conversation: "Hello2" } }));
console.log("V2 Wrapped:", parse({ message: { key: { remoteJid: "c@s", id: "123" }, message: { conversation: "Hello3" } } }));
