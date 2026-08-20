use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::domain::ForestError;

#[derive(Clone, Default)]
pub struct ScanCoordinator {
    inner: Arc<Mutex<Option<ActiveScan>>>,
}

struct ActiveScan {
    id: String,
    cancel: Arc<AtomicBool>,
}

impl ScanCoordinator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn begin(&self) -> Result<(String, Arc<AtomicBool>), ForestError> {
        let mut guard = self.inner.lock().map_err(|_| ForestError::MutexPoisoned)?;
        if guard.is_some() {
            return Err(ForestError::ScanInProgress);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        *guard = Some(ActiveScan {
            id: id.clone(),
            cancel: cancel.clone(),
        });
        Ok((id, cancel))
    }

    pub fn cancel(&self, id: &str) -> Result<(), ForestError> {
        let guard = self.inner.lock().map_err(|_| ForestError::MutexPoisoned)?;
        match guard.as_ref() {
            Some(active) if active.id == id => {
                active.cancel.store(true, Ordering::SeqCst);
                Ok(())
            }
            _ => Err(ForestError::ScanNotFound),
        }
    }

    pub fn finish(&self, id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            if guard.as_ref().is_some_and(|active| active.id == id) {
                *guard = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ScanCoordinator;
    use crate::domain::ForestError;
    use std::sync::atomic::Ordering;

    #[test]
    fn rejects_a_second_active_scan_until_finished() {
        let coordinator = ScanCoordinator::new();
        let (id, cancel) = coordinator.begin().expect("begin");
        assert!(matches!(
            coordinator.begin().expect_err("busy"),
            ForestError::ScanInProgress
        ));
        coordinator.cancel(&id).expect("cancel");
        assert!(cancel.load(Ordering::SeqCst));
        coordinator.finish(&id);
        coordinator.begin().expect("restart");
    }

    #[test]
    fn cancel_requires_the_active_scan_id() {
        let coordinator = ScanCoordinator::new();
        let (id, _) = coordinator.begin().expect("begin");
        let error = coordinator.cancel("missing").expect_err("missing");
        assert!(matches!(error, ForestError::ScanNotFound));
        coordinator.cancel(&id).expect("cancel");
    }
}
