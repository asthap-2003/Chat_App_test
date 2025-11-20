import { useState, useEffect, useRef } from 'react';
import { supabase, Profile, Message } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, LogOut, User, Circle } from 'lucide-react';

export function ChatInterface() {
  const { profile, signOut } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) {
      loadUsers();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedUser && profile) {
      loadMessages();
      const subscription = subscribeToMessages();
      markMessagesAsRead();
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedUser, profile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', profile!.id)
        .order('display_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadMessages = async () => {
    if (!selectedUser || !profile) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},recipient_id.eq.${profile.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const subscribeToMessages = () => {
    return supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${selectedUser!.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.recipient_id === profile!.id) {
            setMessages((prev) => [...prev, newMsg]);
            markMessagesAsRead();
          }
        }
      )
      .subscribe();
  };

  const markMessagesAsRead = async () => {
    if (!selectedUser || !profile) return;

    try {
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('recipient_id', profile.id)
        .eq('sender_id', selectedUser.id)
        .eq('read', false);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !profile || loading) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: profile.id,
        recipient_id: selectedUser.id,
        content: newMessage.trim(),
      });

      if (error) throw error;

      const tempMessage: Message = {
        id: Date.now().toString(),
        sender_id: profile.id,
        recipient_id: selectedUser.id,
        content: newMessage.trim(),
        created_at: new Date().toISOString(),
        read: false,
      };

      setMessages((prev) => [...prev, tempMessage]);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-cyan-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                style={{ backgroundColor: profile?.avatar_color }}
              >
                {profile?.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold text-white">{profile?.display_name}</h2>
                <p className="text-xs text-blue-100">Online</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="p-2 hover:bg-white/20 rounded-lg transition"
              title="Sign out"
            >
              <LogOut className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Contacts
            </h3>
            {users.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No users yet</p>
            ) : (
              <div className="space-y-1">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg transition ${
                      selectedUser?.id === user.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                      style={{ backgroundColor: user.avatar_color }}
                    >
                      {user.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-800">{user.display_name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: selectedUser.avatar_color }}
                >
                  {selectedUser.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800">{selectedUser.display_name}</h2>
                  <div className="flex items-center space-x-1">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                    <span className="text-xs text-gray-500">Online</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => {
                const isSent = message.sender_id === profile?.id;
                return (
                  <div key={message.id} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md`}>
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          isSent
                            ? 'bg-blue-500 text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                      <p
                        className={`text-xs text-gray-500 mt-1 px-1 ${isSent ? 'text-right' : 'text-left'}`}
                      >
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-gray-200 p-4">
              <form onSubmit={sendMessage} className="flex items-center space-x-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !newMessage.trim()}
                  className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="bg-gray-200 p-6 rounded-full inline-block mb-4">
                <User className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Select a Conversation</h3>
              <p className="text-gray-500">Choose a contact to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
