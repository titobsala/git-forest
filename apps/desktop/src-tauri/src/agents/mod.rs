pub mod detection;
pub mod encode;
pub mod runner;

pub use detection::{detect_definition, ExecutableLocator, PathLocator};
pub use encode::encode_command_line;
pub use runner::launch_spec;
