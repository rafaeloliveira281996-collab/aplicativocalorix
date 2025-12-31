
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { UserProfile, DailyLog, Food, MealCategory, AuthUser, Post, Comment, AppNotification, Challenge, FastingState, ReactionType, PostCategory, Reminder, CompletedChallenge, UserChallengeProgress, Meal, Workout } from './types';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import AddFoodModal from './components/AddFoodModal';
import Header from './components/Header';
import { calculateNutritionalGoals } from './utils/nutritionUtils';
import ProfileModal, { ProfileTab } from './components/ProfileModal';
import Auth from './components/Auth';
import CommunityFeed from './components/CommunityFeed';
import RecipesDashboard from './components/RecipesDashboard';
import WorkoutDashboard from './components/WorkoutDashboard';
import { getDefaultReminders } from './utils/reminderUtils';
import Toast from './components/Toast';
import ChangePasswordModal from './components/ChangePasswordModal';
import InteractiveTutorial from './components/InteractiveTutorial';
import { availableChallenges, getStartOfWeek, getWeekNumber, updateChallengeProgress } from './utils/challengeUtils';
import ReportsDashboard from './ReportsDashboard';
import Sidebar from './components/Sidebar';
import QuickViewSidebar from './components/QuickViewSidebar';
import RemindersModal from './components/RemindersModal';
import ChallengesModal from './components/ChallengesModal';
import AchievementsModal from './components/AchievementsModal';
import NotificationsModal from './components/NotificationsModal';
import GoPremiumModal from './GoPremiumModal';
import { defaultBrazilianFoods, LibraryFood } from './utils/brazilianFoodData';
import IntegrationsDashboard from './components/IntegrationsDashboard';

type View = 'dashboard' | 'community' | 'recipes' | 'reports' | 'workouts' | 'integrations';

const initialFastingState: FastingState = { isFasting: false, startTime: null, durationHours: 0, endTime: null, completionNotified: false };

const calculateTotals = (meals: Meal[]) => meals.reduce((acc, m) => {
  m.items.forEach(i => { acc.calories += i.calories; acc.protein += i.protein; acc.carbs += i.carbs; acc.fat += i.fat; });
  return acc;
}, { calories: 0, protein: 0, carbs: 0, fat: 0 });

const App: React.FC = () => {
  const [authUser, setAuthUser] = useLocalStorage<AuthUser | null>('calorix_authUser', null);
  const userProfileKey = authUser ? `userProfile_${authUser.uid}` : null;
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>(userProfileKey, null);
  const dailyLogsKey = authUser ? `dailyLogs_${authUser.uid}` : null;
  const [dailyLogs, setDailyLogs] = useLocalStorage<Record<string, Omit<DailyLog, 'micronutrientIntake'>>>(dailyLogsKey, {});
  const [communityPosts, setCommunityPosts] = useLocalStorage<Post[]>('communityPosts', []);
  const [notifications, setNotifications] = useLocalStorage<AppNotification[]>(authUser ? `notifications_${authUser.uid}` : null, []);
  const [foodLibrary, setFoodLibrary] = useLocalStorage<LibraryFood[]>('calorix_foodLibrary', defaultBrazilianFoods);
  const [fastingState, setFastingState] = useLocalStorage<FastingState>(authUser ? `fastingState_${authUser.email}` : null, initialFastingState);
  const [lastNotified, setLastNotified] = useLocalStorage<Record<string, string>>(authUser ? `lastNotified_${authUser.email}` : null, {});

  const [modalState, setModalState] = useState({ addFood: false, profile: false, reminders: false, challenges: false, achievements: false, notifications: false, password: false, premium: false, sidebar: false, quickView: false });
  const [initialProfileTab, setInitialProfileTab] = useState<ProfileTab>('profile');
  const [mealToAdd, setMealToAdd] = useState<MealCategory | null>(null);
  const [darkMode, setDarkMode] = useLocalStorage<boolean>('darkMode', false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const dateStr = selectedDate.toISOString().split('T')[0];
  const [notifiedGoals, setNotifiedGoals] = useLocalStorage<string[]>(authUser ? `notifiedGoals_${authUser.email}_${dateStr}` : null, []);

  const toggleModal = (key: keyof typeof modalState, val: boolean) => setModalState(prev => ({ ...prev, [key]: val }));
  const showToast = useCallback((message: string) => setToast({ message, id: Date.now() }), []);

  useEffect(() => {
    if (!userProfile || !authUser) return;
    const missingFields = !userProfile.reminders || !userProfile.following || !userProfile.coach?.avatar;
    if (missingFields) {
      setUserProfile({
        ...userProfile,
        reminders: userProfile.reminders || getDefaultReminders(),
        following: userProfile.following || [],
        savedPosts: userProfile.savedPosts || [],
        completedChallenges: userProfile.completedChallenges || [],
        units: userProfile.units || 'metric',
        integrations: userProfile.integrations || { connectedServices: [], syncHistory: [] },
        coach: { id: 'leo', name: userProfile.coach?.name || 'Leo', avatar: userProfile.coach?.avatar || 'https://images.pexels.com/photos/2220337/pexels-photo-2220337.jpeg?auto=compress&cs=tinysrgb&w=400' }
      });
    }
  }, [userProfile, authUser, setUserProfile]);

  const handleAddFoods = (foods: Food[]) => {
    if (!authUser || !mealToAdd) return;
    const timestamp = Date.now();
    const newLogs = { ...dailyLogs };
    const dayLog = newLogs[dateStr] ? { ...newLogs[dateStr] } : { meals: [], waterIntake: 0 };
    const meal = dayLog.meals.find(m => m.name === mealToAdd.name);
    const taggedFoods = foods.map((f, i) => ({ ...f, timestamp: timestamp + i }));
    if (meal) meal.items.push(...taggedFoods); else dayLog.meals.push({ name: mealToAdd.name, items: taggedFoods });
    newLogs[dateStr] = dayLog;
    setDailyLogs(newLogs);
    toggleModal('addFood', false);
    showToast(`${foods.length} item(s) adicionado(s)!`);
  };

  const handleSharePost = useCallback(async (text: string) => {
    let shareUrl = window.location.href;
    try {
      const url = new URL(shareUrl);
      if (!url.protocol.startsWith('http')) shareUrl = 'https://calorix.app';
    } catch { shareUrl = 'https://calorix.app'; }

    const data = { title: 'calorix', text: text || 'Confira no calorix!', url: shareUrl };
    if (navigator.share) {
      try { await navigator.share(data); showToast("Compartilhado!"); }
      catch (e: any) { if (e.name !== 'AbortError') navigator.clipboard.writeText(`${data.text}\n${data.url}`).then(() => showToast("Link copiado!")); }
    } else {
      navigator.clipboard.writeText(`${data.text}\n${data.url}`).then(() => showToast("Link copiado!"));
    }
  }, [showToast]);

  if (!authUser) return <Auth onLogin={setAuthUser} onRegister={setAuthUser} />;
  if (!userProfile) return <Onboarding onProfileCreate={setUserProfile} defaultName={authUser.name} />;
  if (!userProfile.hasCompletedTutorial) return <InteractiveTutorial onComplete={() => setUserProfile({ ...userProfile, hasCompletedTutorial: true })} />;

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-light-bg-main dark:bg-dark-bg text-light-text dark:text-dark-text transition-all">
        <div className={modalState.sidebar || modalState.quickView ? 'blur-sm pointer-events-none' : ''}>
          <Header userProfile={userProfile} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} onProfileClick={() => { setInitialProfileTab('profile'); toggleModal('profile', true); }} currentView={currentView} onNavigate={setCurrentView} toggleSidebar={() => toggleModal('sidebar', true)} toggleDataSidebar={() => toggleModal('quickView', true)} unreadNotificationsCount={notifications.filter(n => !n.read).length} onNotificationsClick={() => toggleModal('notifications', true)} onPremiumClick={() => toggleModal('premium', true)} />
          <main className="max-w-7xl mx-auto p-4 sm:p-8">
            {currentView === 'dashboard' && <Dashboard userProfile={userProfile} selectedDate={selectedDate} onDateChange={setSelectedDate} selectedDateLog={dailyLogs[dateStr] || { meals: [], waterIntake: 0, micronutrientIntake: {} }} dailyLogs={dailyLogs} onAddFoodClick={(m) => { setMealToAdd(m); toggleModal('addFood', true); }} onAddFoodToMeal={() => {}} onDeleteFood={() => {}} onUpdateGoal={() => {}} onSetWater={() => {}} onEditGoals={() => { setInitialProfileTab('goals'); toggleModal('profile', true); }} fastingState={fastingState} onStartFasting={(d) => setFastingState({ ...fastingState, isFasting: true, startTime: Date.now(), durationHours: d, endTime: Date.now() + d * 3600000 })} onStopFasting={() => setFastingState(initialFastingState)} onUpdateFastingTimes={() => {}} onFastingCompletionNotified={() => {}} showCoach={showCoach} onDismissCoach={() => setShowCoach(false)} />}
            {currentView === 'community' && <CommunityFeed posts={communityPosts} currentUserProfile={userProfile} currentUserAuth={authUser} onCreatePost={() => {}} onReactToPost={() => {}} onAddComment={() => {}} onFollowUser={() => {}} onSavePost={() => {}} onSharePost={handleSharePost} />}
            {currentView === 'recipes' && <RecipesDashboard userProfile={userProfile} onAddRecipeToLog={() => {}} />}
            {currentView === 'reports' && <ReportsDashboard userProfile={userProfile} dailyLogs={dailyLogs} onUpgradeClick={() => toggleModal('premium', true)} />}
            {currentView === 'workouts' && <WorkoutDashboard userProfile={userProfile} onLogWorkout={() => {}} dailyLogs={dailyLogs} />}
            {currentView === 'integrations' && <IntegrationsDashboard userProfile={userProfile} onUpdateIntegrations={() => {}} showToast={showToast} />}
          </main>
        </div>
        <Sidebar isOpen={modalState.sidebar} onClose={() => toggleModal('sidebar', false)} userProfile={userProfile} currentView={currentView} onNavigate={(v) => { setCurrentView(v); toggleModal('sidebar', false); }} onLogout={() => setAuthUser(null)} onRemindersClick={() => toggleModal('reminders', true)} onChallengesClick={() => toggleModal('challenges', true)} onAchievementsClick={() => toggleModal('achievements', true)} />
        <QuickViewSidebar isOpen={modalState.quickView} onClose={() => toggleModal('quickView', false)} userProfile={userProfile} dailyLog={dailyLogs[dateStr] || { meals: [], waterIntake: 0, micronutrientIntake: {} }} />
        {modalState.addFood && mealToAdd && <AddFoodModal mealName={mealToAdd.name} onClose={() => toggleModal('addFood', false)} onAddFoods={handleAddFoods} foodLibrary={foodLibrary} onUpdateFoodLibrary={setFoodLibrary} />}
        {modalState.profile && <ProfileModal userProfile={userProfile} dailyLogs={dailyLogs} onClose={() => toggleModal('profile', false)} onSave={(d) => setUserProfile({ ...userProfile, ...d })} onLogout={() => setAuthUser(null)} onUpdateWaterGoal={() => {}} onChangePasswordClick={() => toggleModal('password', true)} onUpgradeClick={() => toggleModal('premium', true)} initialTab={initialProfileTab} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} />}
        {modalState.reminders && <RemindersModal reminders={userProfile.reminders || []} onClose={() => toggleModal('reminders', false)} onSave={(r) => setUserProfile({ ...userProfile, reminders: r })} />}
        {modalState.challenges && <ChallengesModal userProfile={userProfile} onClose={() => toggleModal('challenges', false)} onSelectChallenge={() => {}} onDisableChallenge={() => {}} onCreateAndSelectCustomChallenge={() => {}} />}
        {modalState.achievements && <AchievementsModal userProfile={userProfile} onClose={() => toggleModal('achievements', false)} />}
        {modalState.notifications && <NotificationsModal notifications={notifications} onClose={() => toggleModal('notifications', false)} onMarkAllAsRead={() => setNotifications(notifications.map(n => ({ ...n, read: true })))} />}
        {modalState.password && <ChangePasswordModal onClose={() => toggleModal('password', false)} onChangePassword={async () => ({ success: true, message: 'Sucesso' })} />}
        {modalState.premium && <GoPremiumModal onClose={() => toggleModal('premium', false)} onUpgrade={() => { setUserProfile({ ...userProfile, isPremium: true }); toggleModal('premium', false); }} />}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
};

export default App;
