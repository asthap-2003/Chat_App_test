

import { useState, useEffect, useRef } from 'react';
import { supabase, Profile, Message, Group, ChatRequest } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, LogOut, User, Circle, CheckCircle2, XCircle, MinusCircle, Clock, CircleDashed } from 'lucide-react';

export function ChatInterface() {

  const { profile, signOut, setProfile } = useAuth();
  const statusOptions = [
    { value: 'Available', label: 'Available', icon: <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> },
    { value: 'Busy', label: 'Busy', icon: <XCircle className="w-4 h-4 text-red-500 inline" /> },
    { value: 'Do not disturb', label: 'Do not disturb', icon: <MinusCircle className="w-4 h-4 text-red-400 inline" /> },
    { value: 'Be right back', label: 'Be right back', icon: <Clock className="w-4 h-4 text-yellow-500 inline" /> },
    { value: 'Appear away', label: 'Appear away', icon: <CircleDashed className="w-4 h-4 text-yellow-400 inline" /> },
    { value: 'Appear offline', label: 'Appear offline', icon: <Circle className="w-4 h-4 text-gray-400 inline" /> },
  ];
  // All state declarations must be above any use/effect
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat request status when a user is selected (must be after selectedUser/profile are declared)
  useEffect(() => {
    if (!selectedUser || !profile) {
      setChatRequest(null);
      return;
    }
    const fetchRequest = async () => {
      setRequestLoading(true);
      const { data, error } = await supabase
        .from('chat_requests')
        .select('*')
        .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},recipient_id.eq.${profile.id})`)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        setChatRequest(data[data.length - 1]);
      } else {
        setChatRequest(null);
      }
      setRequestLoading(false);
    };
    fetchRequest();
  }, [selectedUser, profile]);
  const handleStatusChange = async (status: string) => {
    if (!profile) return;
    try {
      await supabase.from('profiles').update({ status }).eq('id', profile.id);
      if (setProfile) setProfile({ ...profile, status });
    } catch (error) {
      console.error('Error updating status:', error);
    }
    setShowStatusDropdown(false);
  };
  // Typing indicator: send event when typing
  useEffect(() => {
    if (!(selectedUser || selectedGroup) || !profile) return;
    const channel = supabase.channel('typing-indicator');
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      if (selectedUser && payload.payload.sender_id === selectedUser.id && payload.payload.recipient_id === profile.id) {
        setOtherTyping(true);
        setTimeout(() => setOtherTyping(false), 2000);
      } else if (selectedGroup && payload.payload.group_id === selectedGroup.id && payload.payload.sender_id !== profile.id) {
        setOtherTyping(true);
        setTimeout(() => setOtherTyping(false), 2000);
      }
    });
    channel.subscribe();
    return () => { channel.unsubscribe(); };
  }, [selectedUser, selectedGroup, profile]);

  const handleTyping = () => {
    if (!(selectedUser || selectedGroup) || !profile) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    setIsTyping(true);
    // Broadcast typing event
    supabase.channel('typing-indicator').send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        sender_id: profile.id,
        recipient_id: selectedUser ? selectedUser.id : null,
        group_id: selectedGroup ? selectedGroup.id : null,
      },
    });
    typingTimeout.current = setTimeout(() => setIsTyping(false), 2000);
  };

  useEffect(() => {
    if (profile) {
      loadUsers();
      loadGroups();
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
    } else if (selectedGroup && profile) {
      loadGroupMessages();
      const subscription = subscribeToGroupMessages();
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedUser, selectedGroup, profile]);

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

  const loadGroups = async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('group_id, groups(*)')
        .eq('user_id', profile.id);
      if (error) throw error;
      setGroups((data || []).map((g: any) => g.groups));
    } catch (error) {
      console.error('Error loading groups:', error);
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

  const loadGroupMessages = async () => {
    if (!selectedGroup || !profile) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', selectedGroup.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading group messages:', error);
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

  const subscribeToGroupMessages = () => {
    return supabase
      .channel('group_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${selectedGroup?.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.group_id === selectedGroup?.id) {
            setMessages((prev) => [...prev, newMsg]);
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

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !profile) return;
    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: newGroupName.trim(), created_by: profile.id })
        .select();
      if (error) throw error;
      const group = data[0];
      await supabase.from('group_members').insert({ group_id: group.id, user_id: profile.id });
      setNewGroupName('');
      loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || loading) return;
    if (!profile) return;
    setLoading(true);
    try {
      // Only allow sending if chat is accepted or group chat
      if (selectedUser) {
        if (!chatRequest) {
          // Create a new chat request
          const { data, error } = await supabase.from('chat_requests').insert({
            sender_id: profile.id,
            recipient_id: selectedUser.id,
            status: 'pending',
          }).select();
          if (error) throw error;
          setChatRequest(data[0]);
          setLoading(false);
          setNewMessage('');
          return;
        } else if (chatRequest.status !== 'accepted') {
          setLoading(false);
          return;
        }
      }
      let messageData: any = {
        sender_id: profile.id,
        content: newMessage.trim(),
      };
      if (selectedUser) {
        messageData.recipient_id = selectedUser.id;
        messageData.group_id = null;
      } else if (selectedGroup) {
        messageData.group_id = selectedGroup.id;
        messageData.recipient_id = null;
      } else {
        setLoading(false);
        return;
      }
      const { error } = await supabase.from('messages').insert(messageData);
      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };
  // Accept/Reject chat request handlers
  const handleAcceptRequest = async () => {
    if (!chatRequest) return;
    setRequestLoading(true);
    const { error } = await supabase.from('chat_requests').update({ status: 'accepted' }).eq('id', chatRequest.id);
    if (!error) setChatRequest({ ...chatRequest, status: 'accepted' });
    setRequestLoading(false);
  };
  const handleRejectRequest = async () => {
    if (!chatRequest) return;
    setRequestLoading(true);
    const { error } = await supabase.from('chat_requests').update({ status: 'rejected' }).eq('id', chatRequest.id);
    if (!error) setChatRequest({ ...chatRequest, status: 'rejected' });
    setRequestLoading(false);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-cyan-500 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: profile?.avatar_color }}
                >
                  {profile?.display_name.charAt(0).toUpperCase()}
                </div>
                {/* Status icon overlay styled like WhatsApp/Teams */}
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full flex items-center justify-center bg-white border-2 border-white shadow" style={{ transform: 'translate(30%, 30%)' }}>
                  <span className="w-3 h-3 rounded-full flex items-center justify-center">
                    {statusOptions.find((s) => s.value === profile?.status)?.icon}
                  </span>
                </span>
              </div>
              <div>
                <h2 className="font-semibold text-white">{profile?.display_name}</h2>
                <button
                  className="flex items-center space-x-1 text-xs text-blue-100 bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition"
                  onClick={() => setShowStatusDropdown((v) => !v)}
                >
                  {statusOptions.find((s) => s.value === profile?.status)?.icon}
                  <span>{profile?.status || 'Available'}</span>
                </button>
                {showStatusDropdown && (
                  <div className="absolute z-10 mt-2 bg-white rounded shadow-lg left-24 w-48 border border-gray-200">
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => handleStatusChange(option.value)}
                      >
                        {option.icon}
                        <span className="ml-2">{option.label}</span>
                      </button>
                    ))}
                  </div>
                )}
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
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Groups
            </h3>
            <form onSubmit={handleCreateGroup} className="flex mb-2 space-x-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New group name"
                className="flex-1 px-2 py-1 border border-gray-300 rounded"
              />
              <button type="submit" className="bg-blue-500 text-white px-3 py-1 rounded">+</button>
            </form>
            {groups.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">No groups yet</p>
            ) : (
              <div className="space-y-1">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      setSelectedGroup(group);
                      setSelectedUser(null);
                    }}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg transition ${
                      selectedGroup?.id === group.id
                        ? 'bg-cyan-50 border border-cyan-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-cyan-500 text-white font-semibold flex-shrink-0">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-800">{group.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Contacts
            </h3>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="w-full mb-2 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {users.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No users yet</p>
            ) : (
              <div className="space-y-1">
                {users
                  .filter(user =>
                    user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    user.email.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((user) => (
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
                        <p className="text-xs text-gray-500 flex items-center space-x-1">
                          {statusOptions.find((s) => s.value === user.status)?.icon}
                          <span>{user.status || 'Available'}</span>
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {(selectedUser || selectedGroup) ? (
          <>
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: selectedUser ? selectedUser.avatar_color : '#06b6d4' }}
                >
                  {selectedUser
                    ? selectedUser.display_name.charAt(0).toUpperCase()
                    : selectedGroup?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800">
                    {selectedUser ? selectedUser.display_name : selectedGroup?.name}
                  </h2>
                  <div className="flex items-center space-x-1">
                    {statusOptions.find((s) => s.value === (selectedUser ? selectedUser.status : profile?.status))?.icon}
                    <span className="text-xs text-gray-500">{selectedUser ? selectedUser.status : profile?.status || 'Available'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat request logic for 1-on-1 chat */}
            {selectedUser && chatRequest && chatRequest.status === 'pending' && (
              <div className="flex flex-col items-center justify-center p-6">
                {chatRequest.sender_id === profile?.id ? (
                  <>
                    <p className="text-gray-500 text-sm mb-2">Waiting for {selectedUser.display_name} to accept your chat request...</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 text-sm mb-2">{selectedUser.display_name} wants to chat with you.</p>
                    <div className="flex space-x-2">
                      <button onClick={handleAcceptRequest} disabled={requestLoading} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Accept</button>
                      <button onClick={handleRejectRequest} disabled={requestLoading} className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400">Reject</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {selectedUser && chatRequest && chatRequest.status === 'rejected' && (
              <div className="flex flex-col items-center justify-center p-6">
                <p className="text-red-500 text-sm mb-2">Chat request was rejected.</p>
              </div>
            )}

            {/* Always show messages and input if a user or group is selected */}
            {(selectedUser || selectedGroup) && (
              <>
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
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        handleTyping();
                      }}
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
                {/* Typing indicator */}
                {otherTyping && (
                  <div className="px-6 pb-2 text-xs text-gray-500 animate-pulse">{selectedUser ? `${selectedUser.display_name} is typing...` : 'Someone is typing...'}</div>
                )}
              </>
            )}
            {/* For group chat, show as before */}
            {selectedGroup && !selectedUser && !chatRequest && (
              <>
                {/* ...existing group chat UI... */}
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="bg-gray-200 p-6 rounded-full inline-block mb-4">
                <User className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Select a Conversation</h3>
              <p className="text-gray-500">Choose a contact or group to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
